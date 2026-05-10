const pageTitles = {
  dashboard: ["Dashboard", "Welcome back, Admin 👋"],
  inventory: ["Inventory", "Manage your suit stock"],
  suits: ["Suit Catalog", "Browse all suit designs"],
  sales: ["Sales Tracker", "Track revenue & sales"],
  outdated: ["Outdated Suits", "Review old & discontinued suits"],
  categories: ["Categories", "Manage suit categories"]
};

const colors = ["#7c6af7", "#ec4899", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a78bfa", "#fb923c"];
let suits = [];
let currentPage = "dashboard";
let activeFilter = "all";
let activeView = "grid";
let editingId = null;
let tempImages = [null, null, null, null];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => `$${Number(value || 0).toLocaleString()}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function loadSuits() {
  suits = await api("/api/suits");
  renderPage(currentPage);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function byCategory() {
  return suits.reduce((acc, suit) => {
    acc[suit.category] ||= [];
    acc[suit.category].push(suit);
    return acc;
  }, {});
}

function filteredSuits() {
  const query = $("#globalSearch").value.trim().toLowerCase();
  return suits.filter(suit => {
    const matchesQuery = !query || [suit.name, suit.category, suit.color, suit.id].join(" ").toLowerCase().includes(query);
    const matchesFilter = activeFilter === "all" || suit.status === activeFilter;
    return matchesQuery && matchesFilter;
  });
}

function statusBadge(status) {
  if (status === "active") return `<span class="badge badge-active">✅ Active</span>`;
  if (status === "low") return `<span class="badge badge-low">⚠️ Low Stock</span>`;
  if (status === "outdated") return `<span class="badge badge-outdated">🔴 Outdated</span>`;
  return `<span class="badge">${esc(status)}</span>`;
}

function thumbStrip(suit) {
  const imgs = (suit.images || []).filter(Boolean);
  if (!imgs.length) return `<div class="thumb-strip"><div class="no-img">📷</div></div>`;
  return `<div class="thumb-strip">${imgs.slice(0, 3).map(src => `<img class="thumb" src="${esc(src)}" alt="${esc(suit.name)}">`).join("")}</div>`;
}

function renderImageSlot(index) {
  const slot = $(`#slot${index}`);
  if (!slot) return;
  slot.querySelectorAll("img").forEach(img => img.remove());
  slot.classList.toggle("has-image", Boolean(tempImages[index]));
  if (tempImages[index]) {
    const img = document.createElement("img");
    img.src = tempImages[index];
    img.alt = `Suit photo ${index + 1}`;
    slot.prepend(img);
  }
}

function setTempImages(images = []) {
  tempImages = [0, 1, 2, 3].map(index => images[index] || null);
  tempImages.forEach((_, index) => {
    renderImageSlot(index);
    const input = $(`[data-image-slot="${index}"]`);
    if (input) input.value = "";
  });
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Image read failed"));
    reader.readAsDataURL(file);
  });
}

function renderPage(page) {
  if (page === "dashboard") renderDashboard();
  if (page === "inventory") renderInventory();
  if (page === "suits") renderCatalog();
  if (page === "sales") renderSales();
  if (page === "outdated") renderOutdated();
  if (page === "categories") renderCategories();
}

function setPage(page) {
  currentPage = page;
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === page));
  $$(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
  $("#pageTitle").textContent = pageTitles[page][0];
  $("#pageSub").textContent = pageTitles[page][1];
  renderPage(page);
}

function renderDashboard() {
  const stock = suits.reduce((sum, suit) => sum + Number(suit.stock), 0);
  const sold = suits.reduce((sum, suit) => sum + Number(suit.sold), 0);
  const outdated = suits.filter(suit => suit.status === "outdated").length;
  $("#stat-stock").textContent = stock;
  $("#stat-sold").textContent = sold.toLocaleString();
  $("#stat-models").textContent = suits.length;
  $("#stat-outdated").textContent = outdated;
  $("#delta-stock").textContent = `${stock} units remaining`;
  $("#delta-sold").textContent = `${sold} total sales`;

  const grouped = byCategory();
  const categories = Object.keys(grouped);
  const sales = categories.map(category => grouped[category].reduce((sum, suit) => sum + Number(suit.sold), 0));
  const stocks = categories.map(category => grouped[category].reduce((sum, suit) => sum + Number(suit.stock), 0));
  const maxSales = Math.max(1, ...sales);

  $("#salesChart").innerHTML = categories.map((category, index) => `
    <div class="bar">
      <div class="bar-fill" style="height:${(sales[index] / maxSales) * 100}%;background:${colors[index % colors.length]}"></div>
      <span>${esc(category)}</span>
    </div>
  `).join("");

  const totalStock = Math.max(1, stocks.reduce((sum, value) => sum + value, 0));
  let start = 0;
  const gradient = stocks.map((value, index) => {
    const end = start + (value / totalStock) * 100;
    const segment = `${colors[index % colors.length]} ${start}% ${end}%`;
    start = end;
    return segment;
  }).join(", ");
  $("#stockDonut").style.background = `conic-gradient(${gradient || `${colors[0]} 0 100%`})`;
  $("#stockLegend").innerHTML = categories.map((category, index) => `
    <div class="legend-item"><span><i style="background:${colors[index % colors.length]}"></i>${esc(category)}</span><strong>${stocks[index]}</strong></div>
  `).join("");

  const top = [...suits].sort((a, b) => b.sold - a.sold).slice(0, 5);
  const maxTop = Math.max(1, ...top.map(suit => suit.sold));
  $("#topSellers").innerHTML = top.map((suit, index) => progressItem(suit.name, `${suit.sold} sold`, (suit.sold / maxTop) * 100, colors[index])).join("");

  $("#stockHealth").innerHTML = categories.map((category, index) => {
    const categorySuits = grouped[category];
    const categoryStock = categorySuits.reduce((sum, suit) => sum + Number(suit.stock), 0);
    const categorySold = categorySuits.reduce((sum, suit) => sum + Number(suit.sold), 0);
    const pct = Math.round((categoryStock / Math.max(1, categoryStock + categorySold)) * 100);
    return progressItem(category, `${pct}% in stock`, pct, colors[index % colors.length]);
  }).join("");
}

function progressItem(label, value, width, color) {
  return `<div>
    <div class="progress-label"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>
    <div class="prog-bar"><div class="prog-fill" style="width:${Math.max(3, width)}%;background:${color}"></div></div>
  </div>`;
}

function renderInventory() {
  const rows = filteredSuits();
  $("#inventoryTableBody").innerHTML = rows.map(suit => `
    <tr>
      <td>${esc(suit.id)}</td><td>${thumbStrip(suit)}</td><td><strong>${esc(suit.name)}</strong><br><span class="suit-meta">${esc(suit.color)}</span></td>
      <td><span class="badge badge-cat">${esc(suit.category)}</span></td><td>${esc(suit.sizes)}</td><td>${suit.stock}</td><td>${suit.sold}</td><td>${money(suit.price)}</td><td>${statusBadge(suit.status)}</td>
      <td><div class="actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(suit.id)}">Edit</button><button class="btn btn-danger btn-sm" data-delete="${esc(suit.id)}">Delete</button></div></td>
    </tr>
  `).join("") || `<tr><td colspan="10">No suits found.</td></tr>`;
}

function renderCatalog() {
  const rows = filteredSuits();
  $("#suitCatalogGrid").classList.toggle("hidden", activeView !== "grid");
  $("#suitCatalogList").classList.toggle("hidden", activeView !== "list");
  $("#suitCatalogGrid").innerHTML = rows.map(suit => `
    <article class="suit-card">
      <div class="suit-img">👔</div>
      <div class="suit-body">
        <h3>${esc(suit.name)}</h3>
        <p class="suit-meta">${esc(suit.category)} · ${esc(suit.color)} · ${esc(suit.sizes)}</p>
        <p class="suit-meta">${esc(suit.desc)}</p>
        <div class="suit-price"><span>${money(suit.price)}</span>${statusBadge(suit.status)}</div>
      </div>
    </article>
  `).join("") || `<article class="panel">No suits found.</article>`;
  $("#catalogListBody").innerHTML = rows.map(suit => `
    <tr><td>${esc(suit.id)}</td><td>${thumbStrip(suit)}</td><td>${esc(suit.name)}</td><td>${esc(suit.category)}</td><td>${esc(suit.color)}</td><td>${money(suit.price)}</td><td>${suit.stock}</td><td><button class="btn btn-ghost btn-sm" data-edit="${esc(suit.id)}">Edit</button></td></tr>
  `).join("");
}

function renderSales() {
  const totalSold = suits.reduce((sum, suit) => sum + Number(suit.sold), 0);
  const revenue = suits.reduce((sum, suit) => sum + Number(suit.sold) * Number(suit.price), 0);
  $("#stat-revenue").textContent = money(revenue);
  $("#stat-units").textContent = totalSold.toLocaleString();
  $("#stat-avgprice").textContent = money(totalSold ? Math.round(revenue / totalSold) : 0);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const max = Math.max(1, totalSold);
  $("#salesLineChart").innerHTML = months.map((month, index) => {
    const value = Math.round(totalSold * (.45 + index * .065));
    return `<div class="line-col"><div style="height:${Math.min(100, (value / max) * 100)}%"></div><span>${month}</span></div>`;
  }).join("");
  $("#salesTableBody").innerHTML = [...suits].sort((a, b) => b.sold - a.sold).map(suit => {
    const suitRevenue = suit.sold * suit.price;
    const pct = revenue ? Math.round((suitRevenue / revenue) * 100) : 0;
    return `<tr><td>${esc(suit.name)}</td><td>${esc(suit.category)}</td><td>${suit.sold}</td><td>${money(suit.price)}</td><td>${money(suitRevenue)}</td><td>${pct}%</td></tr>`;
  }).join("");
}

function renderOutdated() {
  const rows = suits.filter(suit => suit.status === "outdated" || Number(suit.year) <= 2020);
  $("#outdatedTableBody").innerHTML = rows.map(suit => `
    <tr><td>${esc(suit.id)}</td><td>${thumbStrip(suit)}</td><td>${esc(suit.name)}</td><td>${esc(suit.category)}</td><td>${suit.year}</td><td>${suit.stock}</td><td>${money(suit.price)}</td><td><button class="btn btn-success btn-sm" data-clearance="${esc(suit.id)}">Mark Active</button></td></tr>
  `).join("") || `<tr><td colspan="8">No outdated suits.</td></tr>`;
}

function renderCategories() {
  const grouped = byCategory();
  $("#categoryCards").innerHTML = Object.entries(grouped).map(([category, items], index) => {
    const stock = items.reduce((sum, suit) => sum + Number(suit.stock), 0);
    const sold = items.reduce((sum, suit) => sum + Number(suit.sold), 0);
    return `<article class="suit-card">
      <div class="suit-img" style="background:linear-gradient(135deg,${colors[index % colors.length]}44,#22d3ee18)">🗂️</div>
      <div class="suit-body">
        <h3>${esc(category)}</h3>
        <p class="suit-meta">${items.length} suit models · ${stock} in stock · ${sold} sold</p>
        ${progressItem("Stock share", `${stock} units`, Math.min(100, stock), colors[index % colors.length])}
      </div>
    </article>`;
  }).join("");
}

function openModal(suit = null) {
  editingId = suit?.id || null;
  $("#modalTitle").textContent = suit ? "Edit Suit" : "Add New Suit";
  $("#modalSub").textContent = suit ? "Update suit details and save changes to the backend" : "Fill in the details below to add a suit to inventory";
  $("#f-name").value = suit?.name || "";
  $("#f-category").value = suit?.category || "Formal";
  $("#f-color").value = suit?.color || "";
  $("#f-sizes").value = suit?.sizes || "";
  $("#f-price").value = suit?.price || "";
  $("#f-stock").value = suit?.stock || "";
  $("#f-sold").value = suit?.sold || 0;
  $("#f-year").value = suit?.year || new Date().getFullYear();
  $("#f-status").value = suit?.status || "active";
  $("#f-desc").value = suit?.desc || "";
  setTempImages(suit?.images || []);
  $("#suitModal").classList.add("open");
}

function closeModal() {
  $("#suitModal").classList.remove("open");
  editingId = null;
}

function formPayload() {
  return {
    name: $("#f-name").value,
    category: $("#f-category").value,
    color: $("#f-color").value,
    sizes: $("#f-sizes").value,
    price: Number($("#f-price").value),
    stock: Number($("#f-stock").value),
    sold: Number($("#f-sold").value),
    year: Number($("#f-year").value),
    status: $("#f-status").value,
    desc: $("#f-desc").value,
    images: tempImages
  };
}

document.addEventListener("click", async event => {
  const nav = event.target.closest(".nav-item");
  if (nav) setPage(nav.dataset.page);

  if (event.target.id === "addSuitBtn" || event.target.id === "addSuitBtnInv") openModal();
  if (event.target.id === "closeModal" || event.target.id === "suitModal") closeModal();

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    activeFilter = filter.dataset.filter;
    $$(".filter-chip").forEach(btn => btn.classList.toggle("active", btn === filter));
    renderInventory();
  }

  const view = event.target.closest("[data-view]");
  if (view) {
    activeView = view.dataset.view;
    $$(".tab-btn").forEach(btn => btn.classList.toggle("active", btn === view));
    renderCatalog();
  }

  const editId = event.target.dataset.edit;
  if (editId) openModal(suits.find(suit => suit.id === editId));

  const deleteId = event.target.dataset.delete;
  if (deleteId && confirm("Delete this suit from backend data?")) {
    await api(`/api/suits/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    toast("Suit deleted");
    await loadSuits();
  }

  const clearanceId = event.target.dataset.clearance;
  if (clearanceId) {
    const suit = suits.find(item => item.id === clearanceId);
    await api(`/api/suits/${encodeURIComponent(clearanceId)}`, { method: "PUT", body: JSON.stringify({ ...suit, status: "active" }) });
    toast("Suit marked active");
    await loadSuits();
  }

  const removeSlot = event.target.dataset.removeSlot;
  if (removeSlot !== undefined) {
    event.preventDefault();
    event.stopPropagation();
    tempImages[Number(removeSlot)] = null;
    renderImageSlot(Number(removeSlot));
    const input = $(`[data-image-slot="${removeSlot}"]`);
    if (input) input.value = "";
  }
});

document.addEventListener("change", async event => {
  const input = event.target.closest("[data-image-slot]");
  if (!input || !input.files?.[0]) return;
  const index = Number(input.dataset.imageSlot);
  tempImages[index] = await readImageFile(input.files[0]);
  renderImageSlot(index);
});

$("#suitForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = formPayload();
  if (editingId) {
    await api(`/api/suits/${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(payload) });
    toast("Suit updated");
  } else {
    await api("/api/suits", { method: "POST", body: JSON.stringify(payload) });
    toast("Suit added");
  }
  closeModal();
  await loadSuits();
});

$("#globalSearch").addEventListener("input", () => renderPage(currentPage));

loadSuits().catch(error => {
  console.error(error);
  toast(error.message);
});
