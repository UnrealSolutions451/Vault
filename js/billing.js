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
const confirmOnlineBtn = document.getElementById("confirmOnlineBtn");

const qrScannerModal = document.getElementById("qrScannerModal");
const closeScannerBtn = document.getElementById("closeScannerBtn");

/* ================= HELPERS ================= */
function calculateTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price), 0);
}

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
    div.style.cursor = "pointer";
    div.style.padding = "6px";

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

/* ================= QR SCANNER ================= */
scanBtn.addEventListener("click", async () => {
  qrScannerModal.style.display = "flex";
  const qrDiv = document.getElementById("qrScanner");
  qrDiv.innerHTML = "";

  try {
    /* ===== Force browser permission request ===== */
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    // Stop temporary stream immediately (important!)
    tempStream.getTracks().forEach(track => track.stop());

    /* ===== Create QR Scanner ===== */
    scanner = new Html5Qrcode("qrScanner");

    await scanner.start(
      { facingMode: "environment" },   // safer than cameraId
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        try {
          const payload = JSON.parse(decodedText);

          if (payload.store_id !== profile.store_id) {
            alert("QR belongs to another store");
            return;
          }

          const item = inventory.find(i => i.id === payload.item_id);
          if (!item) return alert("Item not found");

          cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            size: payload.size && payload.size !== "NA" ? payload.size : null
          });

          renderCart();
          stopScanner();

        } catch (err) {
          console.error("QR parse error:", err);
          alert("Invalid QR code");
        }
      }
    );

  } catch (err) {
    console.error("Camera error:", err);

    if (err.name === "NotAllowedError") {
      alert("Camera permission blocked. Please allow camera access in browser settings.");
    } 
    else if (err.name === "NotFoundError") {
      alert("No camera found on this device.");
    } 
    else {
      alert("Camera unavailable or already in use.");
    }
  }
});

function stopScanner() {
  if (scanner) {
    scanner.stop().catch(() => {});
    scanner = null;
  }
  qrScannerModal.style.display = "none";
}

closeScannerBtn.addEventListener("click", stopScanner);




function stopScanner() {
  if (scanner) {
    scanner.stop().catch(() => {});
    scanner = null;
  }
  qrScannerModal.style.display = "none";
}

closeScannerBtn.addEventListener("click", stopScanner);

/* ================= CHECKOUT ================= */
checkoutBtn.addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const mode = paymentModeEl.value;

  if (mode === "online") {
    openUPIQr();   // QR only
  } else {
    finalizeSale("cash");  // cash → direct save
  }
});

/* ================= UPI FLOW ================= */
function openUPIQr() {
  const total = calculateTotal();

  generateUPI(total);

  pendingOnlineSale = {
    total,
    cart: [...cart]
  };

  upiModal.style.display = "flex";
}

confirmOnlineBtn.addEventListener("click", async () => {
  if (!pendingOnlineSale) return;

  await finalizeSale("online");

  pendingOnlineSale = null;
  upiModal.style.display = "none";
});

closeUPIBtn.addEventListener("click", () => {
  upiModal.style.display = "none";
});

/* ================= FINALIZE SALE ================= */
async function finalizeSale(mode) {
  try {
    const total = calculateTotal();

    const { error } = await supabase.from("sales").insert([{
      store_id: profile.store_id,
      total,
      payment_mode: mode,
      items: cart
    }]);

    if (error) throw error;

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

  } catch (err) {
    console.error("Sale Error:", err);
    alert("Failed to complete order");
  }
}

/* ================= GENERATE UPI QR ================= */
function generateUPI(amount) {
  const upiId = profile.upi_id || "ahmed451ali@ybl";
  const payload = `upi://pay?pa=${upiId}&pn=Vault&am=${amount}&cu=INR`;

  const upiQRDiv = document.getElementById("upiQR");
  upiQRDiv.innerHTML = "";

  new QRCode(upiQRDiv, {
    text: payload,
    width: 220,
    height: 220
  });
}
