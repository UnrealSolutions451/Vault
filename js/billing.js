import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

let scanner = null;

/* ================= AUTH ================= */
await requireAuth();

let profile = null;

async function loadProfile() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
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
    alert("Profile not found");
    location.href = "login.html";
    return;
  }

  profile = data;
}

await loadProfile();

/* ================= STATE ================= */
let inventory = [];
let cart = [];

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
    .eq("store_id", profile.store_id);

  if (error) {
    alert("Failed to load inventory");
    return;
  }

  inventory = data || [];
  console.log("Inventory:", inventory);
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
    div.onclick = () => {
      searchInput.value = item.name;
      suggestions.innerHTML = "";
    };
    suggestions.appendChild(div);
  });
});

/* ================= CART ================= */
function renderCart() {
  cartBody.innerHTML = "";
  let total = 0;

  cart.forEach((item, index) => {
    total += Number(item.price);

    cartBody.innerHTML += `
      <tr>
        <td>${item.name}</td>
        <td>${item.size || "-"}</td>
        <td>₹${item.price}</td>
        <td>
          <button class="icon-btn danger" data-index="${index}">❌</button>
        </td>
      </tr>
    `;
  });

  totalAmount.innerText = total.toFixed(2);
}

/* ================= ADD MANUAL ITEM ================= */
addBtn.onclick = () => {
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
};

/* ================= REMOVE ITEM ================= */
cartBody.onclick = (e) => {
  if (e.target.tagName === "BUTTON") {
    const index = e.target.dataset.index;
    cart.splice(index, 1);
    renderCart();
  }
};

/* ================= IOS SAFE FULLSCREEN QR SCANNER ================= */

let html5Qr = null;
let scanning = false;

scanBtn.onclick = async () => {
  qrScannerModal.style.display = "flex";

  const container = document.getElementById("qrScanner");
  container.innerHTML = "";

  html5Qr = new Html5Qrcode("qrScanner");

  try {
    scanning = true;

    await html5Qr.start(
      {
        facingMode: "environment"   // ✅ force back camera (works on iPhone)
      },
      {
        fps: 20,                   // ⚡ faster detection
        disableFlip: true          // improves iOS detection
      },
      onFastScanSuccess,
      () => {}
    );
  } catch (err) {
    console.error("Camera start error:", err);
    alert("Camera unavailable or permission denied ❌");
  }
};


async function onFastScanSuccess(decodedText) {
  if (!scanning) return;
  scanning = false;

  console.log("⚡ FAST QR:", decodedText);

  await stopScanner();
  qrScannerModal.style.display = "none";

  // ✅ Clean iOS hidden characters
  const clean = decodedText
    .replace(/[\u0000-\u001F]+/g, "")
    .trim();

  let payload;
  try {
    payload = JSON.parse(clean);
  } catch {
    alert("Invalid QR ❌");
    return;
  }

  if (!payload?.item_id || !payload?.store_id) {
    alert("QR missing item data ❌");
    return;
  }

  if (String(payload.store_id) !== String(profile.store_id)) {
    alert("QR belongs to another store ❌");
    return;
  }

  const item = inventory.find(
    i => String(i.id) === String(payload.item_id)
  );

  if (!item) {
    alert("Item not found in inventory ❌");
    return;
  }

  cart.push({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    size: payload.size && payload.size !== "NA" ? payload.size : null
  });

  renderCart();
}

async function stopScanner() {
  try {
    if (html5Qr) {
      await html5Qr.stop();
      await html5Qr.clear();
      html5Qr = null;
    }
  } catch (e) {}

  scanning = false;
  qrScannerModal.style.display = "none";
}

closeScannerBtn.onclick = stopScanner;




/* ================= CHECKOUT ================= */
checkoutBtn.onclick = () => {
  if (cart.length === 0) {
    alert("Cart is empty");
    return;
  }

  const mode = paymentModeEl.value;

  if (mode === "online") {
    generateUPI(totalAmount.innerText);
  } else {
    finalizeSale("cash");
  }
};

/* ================= FINALIZE SALE ================= */
async function finalizeSale(mode) {
  const { error } = await supabase.from("sales").insert([{
    store_id: profile.store_id,
    total: Number(totalAmount.innerText),
    payment_mode: mode,
    items: cart
  }]);

  if (error) {
    console.error(error);
    return alert("Failed to save sale");
  }

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
function generateUPI(amount) {
  const upiId = profile.upi_id || "ahmed451ali@ybl";
  const payload = `upi://pay?pa=${upiId}&pn=Vault&am=${amount}&cu=INR`;

  const upiQRDiv = document.getElementById("upiQR");
  upiQRDiv.innerHTML = "";
  new QRCode(upiQRDiv, { text: payload, width: 200, height: 200 });

  upiModal.style.display = "flex";
}

closeUPIBtn.onclick = () => {
  upiModal.style.display = "none";
};
