import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";

/* ================= AUTH ================= */
await requireAuth();

const profile = JSON.parse(localStorage.getItem("profile"));

if (!profile) {
  alert("Profile missing. Login again.");
  window.location.href = "login.html";
}

if (profile.role !== "admin") {
  alert("Admins only.");
  window.location.href = "index.html";
}

/* ================= ELEMENTS ================= */
const hasSizes = document.getElementById("hasSizes");
const sizesBox = document.getElementById("sizesBox");
const qtyInput = document.getElementById("qty");
const inventoryBody = document.getElementById("inventoryBody");
const searchInput = document.getElementById("searchInput");

let inventoryCache = [];
let editingItemId = null;

/* ================= TOGGLE SIZES ================= */
hasSizes.addEventListener("change", () => {
  if (hasSizes.checked) {
    sizesBox.style.display = "block";
    qtyInput.style.display = "none";
    qtyInput.value = "";
  } else {
    sizesBox.style.display = "none";
    qtyInput.style.display = "block";
  }
});

/* ================= LOAD INVENTORY ================= */
async function loadInventory() {

  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("store_id", profile.store_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load Error:", error);
    alert(error.message);
    return;
  }

  inventoryCache = data;
  renderInventory(data);
}

loadInventory();

/* ================= RENDER ================= */
function renderInventory(items) {

  if (!items.length) {
    inventoryBody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center;">No items found</td>
      </tr>
    `;
    return;
  }

  inventoryBody.innerHTML = items.map(item => {

    const lowStock = item.quantity < 2;

    return `
      <tr class="${lowStock ? "low-stock" : ""}">
        <td>${item.name}</td>
        <td>${item.brand || "-"}</td>
        <td>₹${item.price}</td>
        <td>
          ${item.quantity}
          ${lowStock ? `<span class="badge">LOW</span>` : ""}
        </td>
        <td>${item.size_s}</td>
        <td>${item.size_m}</td>
        <td>${item.size_l}</td>
        <td>${item.size_xl}</td>
        <td>${item.size_xxl}</td>

        <td style="white-space:nowrap;">
          <button class="icon-btn" onclick="editItem('${item.id}')">✏️</button>
          <button class="icon-btn danger" onclick="deleteItem('${item.id}')">🗑️</button>
          <button class="icon-btn" onclick="openQR('${item.id}')">📦</button>

        </td>
      </tr>
    `;
  }).join("");
}

/* ================= SEARCH ================= */
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();

    const filtered = inventoryCache.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.brand || "").toLowerCase().includes(q)
    );

    renderInventory(filtered);
  });
}

/* ================= DELETE ================= */
window.deleteItem = async function (id) {

  if (!confirm("Delete this item permanently?")) return;

  const { error } = await supabase
    .from("inventory")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete Error:", error);
    alert(error.message);
    return;
  }

  alert("Item deleted ✅");
  loadInventory();
};

/* ================= EDIT ================= */
window.editItem = function (id) {

  const item = inventoryCache.find(i => i.id === id);
  if (!item) return;

  editingItemId = id;

  document.getElementById("name").value = item.name;
  document.getElementById("brand").value = item.brand || "";
  document.getElementById("price").value = item.price;

  document.getElementById("s").value = item.size_s;
  document.getElementById("m").value = item.size_m;
  document.getElementById("l").value = item.size_l;
  document.getElementById("xl").value = item.size_xl;
  document.getElementById("xxl").value = item.size_xxl;

  if (
    item.size_s ||
    item.size_m ||
    item.size_l ||
    item.size_xl ||
    item.size_xxl
  ) {
    hasSizes.checked = true;
    sizesBox.style.display = "block";
    qtyInput.style.display = "none";
  } else {
    hasSizes.checked = false;
    sizesBox.style.display = "none";
    qtyInput.style.display = "block";
    qtyInput.value = item.quantity;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
};

/* ================= SAVE ================= */
window.saveItem = async function () {

  const name = document.getElementById("name").value.trim();
  const brand = document.getElementById("brand").value.trim();
  const price = Number(document.getElementById("price").value);

  if (!name || price <= 0) {
    return alert("Item name and price required.");
  }

  const sizes = {
    size_s: Number(document.getElementById("s").value || 0),
    size_m: Number(document.getElementById("m").value || 0),
    size_l: Number(document.getElementById("l").value || 0),
    size_xl: Number(document.getElementById("xl").value || 0),
    size_xxl: Number(document.getElementById("xxl").value || 0),
  };

  let totalQty = hasSizes.checked
    ? Object.values(sizes).reduce((a, b) => a + b, 0)
    : Number(qtyInput.value);

  if (totalQty <= 0) {
    return alert("Quantity must be greater than 0.");
  }

  /* UPDATE MODE */
  if (editingItemId) {

    const { error } = await supabase
      .from("inventory")
      .update({
        name,
        brand,
        price,
        quantity: totalQty,
        ...sizes
      })
      .eq("id", editingItemId);

    if (error) {
      console.error("Update Error:", error);
      alert(error.message);
      return;
    }

    alert("Item updated ✅");
    editingItemId = null;
  }

  /* INSERT MODE */
  else {

    const { error } = await supabase
      .from("inventory")
      .insert([{
        store_id: profile.store_id,
        name,
        brand,
        price,
        quantity: totalQty,
        ...sizes
      }]);

    if (error) {
      console.error("Insert Error:", error);
      alert(error.message);
      return;
    }

    alert("Item added ✅");
  }

  clearForm();
  loadInventory();
};

/* ================= CLEAR FORM ================= */
function clearForm() {
  document.querySelectorAll("input").forEach(i => i.value = "");
  hasSizes.checked = false;
  sizesBox.style.display = "none";
  qtyInput.style.display = "block";
  editingItemId = null;
}
/* ================= QR GENERATOR ================= */

const qrModal = document.getElementById("qrModal");
const qrContainer = document.getElementById("qrContainer");

window.openQR = function (id) {

  const item = inventoryCache.find(i => i.id === id);
  if (!item) return;

  qrContainer.innerHTML = "";

  const sizes = [
    { label: "S", qty: item.size_s },
    { label: "M", qty: item.size_m },
    { label: "L", qty: item.size_l },
    { label: "XL", qty: item.size_xl },
    { label: "XXL", qty: item.size_xxl }
  ];

  // Check if any size quantity exists
  const hasAnySize = sizes.some(s => s.qty > 0);

  if (hasAnySize) {
    /* Generate QR based on sizes */
    sizes.forEach(size => {
      for (let i = 0; i < size.qty; i++) {
        createQR(item, size.label);
      }
    });
  } else {
    /* Generate QR based on total quantity */
    for (let i = 0; i < item.quantity; i++) {
      createQR(item, "NA");
    }
  }

  qrModal.style.display = "flex";
};


window.closeQR = function () {
  qrModal.style.display = "none";
};

window.printQR = function () {
  const win = window.open("", "", "width=900,height=600");
  win.document.write(`
    <html>
      <head>
        <title>Print QR</title>
        <style>
          body { font-family: sans-serif; }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, 120px);
            gap: 15px;
          }
        </style>
      </head>
      <body>
        <div class="grid">${qrContainer.innerHTML}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
};
function createQR(item, sizeLabel) {

  const payload = JSON.stringify({
    store_id: profile.store_id,
    item_id: item.id,
    size: sizeLabel
  });

  const box = document.createElement("div");
  box.className = "qr-box";

  const qrDiv = document.createElement("div");
  new QRCode(qrDiv, {
    text: payload,
    width: 100,
    height: 100
  });

  const label = document.createElement("div");
  label.style.lineHeight = "1.2";
  label.style.marginTop = "4px";
  label.style.fontSize = "14px";

  label.innerHTML = `
    <strong>${item.name}</strong><br>
    ${item.brand || "—"}<br>
    ${sizeLabel !== "NA" ? `Size: ${sizeLabel}<br>` : ""}

    Price: ₹${item.price}
  `;

  box.appendChild(qrDiv);
  box.appendChild(label);
  qrContainer.appendChild(box);
}
window.printAllQR = function () {

  if (!inventoryCache.length) {
    alert("No inventory items available.");
    return;
  }

  qrContainer.innerHTML = "";

  inventoryCache.forEach(item => {

    const sizes = [
      { label: "S", qty: item.size_s },
      { label: "M", qty: item.size_m },
      { label: "L", qty: item.size_l },
      { label: "XL", qty: item.size_xl },
      { label: "XXL", qty: item.size_xxl }
    ];

    const hasAnySize = sizes.some(s => s.qty > 0);

    if (hasAnySize) {
      sizes.forEach(size => {
        for (let i = 0; i < size.qty; i++) {
          createQR(item, size.label);
        }
      });
    } else {
      for (let i = 0; i < item.quantity; i++) {
        createQR(item, "NA");
      }
    }

  });

  // Open modal so user can preview
  qrModal.style.display = "flex";

  // Auto open print after short delay (QR render time)
  setTimeout(() => {
    printQR();
  }, 800);
};


