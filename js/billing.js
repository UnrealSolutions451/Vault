import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

let pendingOnlineSale = null;

/* ================= AUTH ================= */
await requireAuth();   // protect page

let profile = null;

/* Load profile manually */
async function loadProfile() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    alert("Authentication failed");
    location.href = "login.html";
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (error || !data) {
    console.error("Profile load error:", error);
    alert("Profile not found");
    location.href = "login.html";
    return;
  }

  profile = data;
  console.log("Profile Loaded:", profile);
}

await loadProfile();

/* ================= STATE ================= */
let inventory = [];
let cart = [];
let scanner = null;

/* ================= ELEMENTS ================= */
const searchInput = document.getElementById("searchInput");
const sizeSelect = document.getElementById("sizeSelect");
const suggestions = document.getElementById("suggestions");
const addBtn = document.getElementById("addBtn");
const scanBtn = document.getElementById("scanBtn");
const cartBody = document.getElementById("cartBody");
const totalAmount = document.getElementById("totalAmount");
const checkoutBtn = document.getElementById("checkoutBtn");
const paymentModeEl = document.getElementById("paymentMode");
const upiModal = document.getElementById("upiModal");
const closeUPIBtn = document.getElementById("closeUPIBtn");
const qrScannerModal = document.getElementById("qrScannerModal");
const closeScannerBtn = document.getElementById("closeScannerBtn");

/* ================= LOAD INVENTORY ================= */
async function loadInventory() {
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("store_id", profile.store_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load inventory:", error);
    alert("Failed to load inventory");
    return;
  }

  inventory = data || [];
  console.log("Inventory Loaded:", inventory);
}

await loadInventory();

/* ================= AUTOCOMPLETE ================= */
searchInput.addEventListener("input", () => {
  const text = searchInput.value.toLowerCase().trim();
  suggestions.innerHTML = "";
  if (!text) return;

  const matches = inventory.filter(i =>
    i.name.toLowerCase().includes(text)
  );

  matches.forEach(item => {
    const div = document.createElement("div");
    div.innerText = `${item.name} (${item.brand || "-"})`;
    div.style.padding = "6px";
    div.style.cursor = "pointer";
    div.onmouseenter = () => div.style.background = "#f1f5f9";
    div.onmouseleave = () => div.style.background = "white";

    div.addEventListener("click", () => {
      searchInput.value = item.name;
      suggestions.innerHTML = "";
    });

    suggestions.appendChild(div);
  });
});

/* ================= CART ================= */
function renderCart() {
  cartBody.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += Number(item.price);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.size || "-"}</td>
      <td>₹${item.price}</td>
      <td>
        <button class="icon-btn danger" data-index="${index}">❌</button>
      </td>
    `;
    cartBody.appendChild(tr);
  });

  totalAmount.innerText = total.toFixed(2);
}

/* ================= ADD MANUAL ITEM ================= */
addBtn.addEventListener("click", () => {
  const name = searchInput.value.trim();
  const size = sizeSelect.value || null;

  if (!name) return alert("Enter item name");

  const item = inventory.find(
    i => i.name.toLowerCase() === name.toLowerCase()
  );

  if (!item) return alert("Item not found");

  cart.push({
    id: item.id,
    name: item.name,
    price: item.price,
    size
  });

  renderCart();
  searchInput.value = "";
  sizeSelect.value = "";
});

/* ================= REMOVE ITEM ================= */
cartBody.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    const index = e.target.dataset.index;
    cart.splice(index, 1);
    renderCart();
  }
});

/* =========================================================
   ✅ QR SCANNER — USING Html5QrcodeScanner (STABLE METHOD)
   ========================================================= */

scanBtn.addEventListener("click", () => {
  qrScannerModal.style.display = "flex";

  const qrDiv = document.getElementById("qrScanner");
  qrDiv.innerHTML = "";

  try {
    scanner = new window.Html5QrcodeScanner(
      "qrScanner",
      { fps: 10, qrbox: 280 },
      false
    );

    scanner.render(onScanSuccess, () => {});
  } catch (err) {
    console.error("Scanner init error:", err);
    alert("Unable to start camera");
  }
});

function onScanSuccess(decodedText) {
  try {
    const payload = JSON.parse(decodedText);

    if (payload.store_id !== profile.store_id) {
      alert("QR belongs to another store");
      return;
    }

    const item = inventory.find(i => i.id === payload.item_id);
    if (!item) {
      alert("Item not found");
      return;
    }

    cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      size: payload.size && payload.size !== "NA" ? payload.size : null
    });

    renderCart();
    closeScanner();

  } catch (err) {
    console.warn("Invalid QR payload:", decodedText);
    alert("Invalid QR Code");
  }
}

function closeScanner() {
  try {
    if (scanner) {
      scanner.clear();
      scanner = null;
    }
  } catch (e) {}

  qrScannerModal.style.display = "none";
}

closeScannerBtn.addEventListener("click", closeScanner);

/* ================= CHECKOUT ================= */
checkoutBtn.addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const mode = paymentModeEl.value;

  if (mode === "online") {
    openUPIQr();   // show QR only
  } else {
    finalizeSale("cash");  // cash → directly complete
  }
});

/* ================= FINALIZE SALE ================= */
async function finalizeSale(mode) {
  const total = Number(totalAmount.innerText);

  const { error } = await supabase.from("sales").insert([{
    store_id: profile.store_id,
    total,
    payment_mode: mode
  }]);

  if (error) {
    console.error(error);
    return alert("Failed to save sale");
  }

  // Deduct inventory
  for (let item of cart) {
    await supabase.rpc("reduce_inventory", {
      item_id_input: item.id,
      size_input: item.size || null
    });
  }

  alert("Order completed ✅");
  cart = [];
  renderCart();
  await loadInventory();
}

/* ================= UPI QR ================= */
function openUPIQr() {
  const amount = Number(totalAmount.innerText);
  const upiId = profile.upi_id || "demo@upi";
  const payload = `upi://pay?pa=${upiId}&pn=Vault&am=${amount}&cu=INR`;

  const upiQRDiv = document.getElementById("upiQR");
  upiQRDiv.innerHTML = "";
  new QRCode(upiQRDiv, { text: payload, width: 220, height: 220 });

  upiModal.style.display = "flex";

  // Save pending sale
  pendingOnlineSale = true;
}

closeUPIBtn.addEventListener("click", () => {
  upiModal.style.display = "none";

  if (pendingOnlineSale) {
    if (confirm("Payment completed? Mark sale as completed?")) {
      finalizeSale("online");
      pendingOnlineSale = null;
    }
  }
});
