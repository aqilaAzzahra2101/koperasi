const STORAGE_KEY = "stokkita-data-v1";
const state = loadState();
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});
const productForm = document.querySelector("#product-form");
const movementForm = document.querySelector("#movement-form");
const productInput = document.querySelector("#movement-product");
const productPicker = document.querySelector("#movement-product-picker");
const productOptions = document.querySelector("#movement-product-options");
const selectedProductsContainer = document.querySelector("#movement-selected-products");
const movementType = document.querySelector("#movement-type");
const movementPrice = document.querySelector("#movement-price");
const movementDate = document.querySelector("#movement-date");
const historyFilter = document.querySelector("#history-filter");
const toast = document.querySelector("#toast");
const productSubmit = document.querySelector("#product-submit");
const productCancel = document.querySelector("#product-cancel");
const productFormTitle = document.querySelector("#product-form-title");
const productStockLabel = document.querySelector('label[for="opening-stock"]');
let toastTimer;
let editingProductId = null;
const selectedMovementProductIds = new Set();
const movementQuantities = new Map();
let activeMovementOption = -1;
let showAllMovementProducts = false;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { products: [], movements: [] };
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.movements)) {
      throw new Error("Format data stok tidak valid.");
    }
    return parsed;
  } catch (error) {
    console.error("Gagal membaca data stok:", error);
    return { products: [], movements: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function addMovement(product, type, quantity, price, date) {
  state.movements.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: product.id,
    productName: product.name,
    type,
    quantity,
    price,
    date
  });
}

function render() {
  const totalQuantity = state.products.reduce((sum, product) => sum + product.stock, 0);
  const totalValue = state.products.reduce((sum, product) => sum + product.stock * product.price, 0);
  document.querySelector("#summary-products").textContent = state.products.length;
  document.querySelector("#summary-quantity").textContent = new Intl.NumberFormat("id-ID").format(totalQuantity);
  document.querySelector("#summary-value").textContent = rupiah.format(totalValue);

  const searchTerm = document.querySelector("#search").value.trim().toLocaleLowerCase("id");
  const visibleProducts = state.products.filter(product =>
    `${product.name} ${product.category}`.toLocaleLowerCase("id").includes(searchTerm)
  );
  document.querySelector("#inventory-rows").innerHTML = visibleProducts.map(product => `
    <tr>
      <td class="table-cell-strong">${escapeHtml(product.name)}</td>
      <td>${escapeHtml(product.category || "—")}</td>
      <td>${rupiah.format(product.price)}</td>
      <td><span class="status-badge ${product.stock === 0 ? "status-out" : "status-in"}">${product.stock}</span></td>
      <td>${rupiah.format(product.stock * product.price)}</td>
      <td>
        <div class="table-actions">
          <button class="table-button" type="button" data-add-stock="${escapeHtml(product.id)}">Tambah 1 stok</button>
          <button class="table-button" type="button" data-edit-product="${escapeHtml(product.id)}">Edit</button>
          <button class="table-button delete-button" type="button" data-delete-product="${escapeHtml(product.id)}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join("");
  document.querySelector("#inventory-empty").textContent = state.products.length
    ? "Tidak ada barang yang cocok dengan pencarian."
    : "Belum ada barang. Tambahkan barang untuk memulai.";
  document.querySelector("#inventory-empty").hidden = visibleProducts.length > 0;

  for (const productId of selectedMovementProductIds) {
    if (!state.products.some(item => item.id === productId)) {
      selectedMovementProductIds.delete(productId);
      movementQuantities.delete(productId);
    }
  }
  renderSelectedMovementProducts();
  if (!productOptions.hidden) renderMovementProductOptions();

  const filteredMovements = state.movements.filter(movement =>
    historyFilter.value === "semua" || movement.type === historyFilter.value
  );
  const latestMovements = [...filteredMovements]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 30);
  document.querySelector("#history-rows").innerHTML = latestMovements.map(movement => `
    <tr>
      <td>
        <strong class="product-name">${escapeHtml(movement.productName)}</strong>
        <span class="date-label">${formatDate(movement.date)}</span>
      </td>
      <td><span class="status-badge ${movement.type === "masuk" ? "status-in" : "status-out"}">${movement.type === "masuk" ? "Masuk" : "Keluar"}</span></td>
      <td>${movement.quantity}</td>
      <td>${rupiah.format(movement.price * movement.quantity)}</td>
    </tr>
  `).join("");
  document.querySelector("#history-empty").textContent = filteredMovements.length
    ? "Tidak ada transaksi pada kategori ini."
    : "Belum ada transaksi.";
  document.querySelector("#history-empty").hidden = latestMovements.length > 0;
  updateSelectedProduct();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function updateSelectedProduct() {
  const products = getSelectedMovementProducts();
  const isOutgoing = movementType.value === "keluar";
  movementPrice.readOnly = isOutgoing;
  movementPrice.placeholder = isOutgoing && products.length > 1
    ? "Mengikuti harga tiap barang"
    : "";
  if (isOutgoing) {
    movementPrice.value = products.length === 1 ? String(products[0].price) : "";
  } else if (!products.length) {
    movementPrice.value = "";
  } else if (!movementPrice.value) {
    movementPrice.value = String(products[0].price);
  }
  document.querySelector("#stock-hint").textContent = products.length
    ? `${products.length} barang dipilih. Isi jumlah masing-masing pada daftar di atas.`
    : "Isi jumlah untuk masing-masing barang yang dipilih.";
  document.querySelector("#price-hint").textContent = isOutgoing
    ? "Harga keluar mengikuti harga masing-masing barang."
    : products.length > 1
      ? "Harga ini akan diterapkan ke semua barang yang dipilih."
      : "Harga masuk akan menjadi harga terkini barang.";
}

function getSelectedMovementProducts() {
  return [...selectedMovementProductIds]
    .map(productId => state.products.find(item => item.id === productId))
    .filter(Boolean);
}

function renderSelectedMovementProducts() {
  const products = getSelectedMovementProducts();
  selectedProductsContainer.innerHTML = products.map((product, index) => `
    <div class="selected-product-row">
      <div class="selected-product-details">
        <span class="selected-product-name">${escapeHtml(product.name)}</span>
        <span class="selected-product-stock">Stok tersedia: ${product.stock}</span>
        <button class="remove-selected-product" type="button" data-product-id="${escapeHtml(product.id)}"
          aria-label="Hapus ${escapeHtml(product.name)} dari pilihan">Hapus</button>
      </div>
      <label class="selected-product-quantity-field" for="movement-quantity-${index}">
        Jumlah
        <input id="movement-quantity-${index}" class="selected-product-quantity" type="number"
          min="1" step="1" required inputmode="numeric" data-product-id="${escapeHtml(product.id)}"
          aria-label="Jumlah ${escapeHtml(product.name)}"
          value="${escapeHtml(movementQuantities.get(product.id) || "")}" placeholder="1">
      </label>
    </div>
  `).join("");
  selectedProductsContainer.hidden = products.length === 0;
}

function renderMovementProductOptions() {
  const query = showAllMovementProducts
    ? ""
    : productInput.value.trim().toLocaleLowerCase("id");
  const matches = state.products.filter(product =>
    product.name.toLocaleLowerCase("id").includes(query)
  );
  activeMovementOption = -1;
  productInput.removeAttribute("aria-activedescendant");
  productOptions.innerHTML = matches.length
    ? matches.map((product, index) => `
      <button id="movement-product-option-${index}" class="searchable-option" type="button"
        role="option" aria-selected="${selectedMovementProductIds.has(product.id)}"
        data-product-id="${escapeHtml(product.id)}">
        <span class="searchable-option-name">${escapeHtml(product.name)}</span>
        <span class="searchable-option-stock">${selectedMovementProductIds.has(product.id) ? "Dipilih · " : ""}Stok ${product.stock}</span>
      </button>
    `).join("")
    : '<div class="searchable-no-results" role="option" aria-disabled="true">Barang tidak ditemukan.</div>';
  productOptions.hidden = false;
  productInput.setAttribute("aria-expanded", "true");
}

function closeMovementProductOptions() {
  productOptions.hidden = true;
  productInput.setAttribute("aria-expanded", "false");
  productInput.removeAttribute("aria-activedescendant");
  activeMovementOption = -1;
}

function setActiveMovementOption(index) {
  const options = productOptions.querySelectorAll('[role="option"]:not([aria-disabled="true"])');
  if (!options.length) return;
  activeMovementOption = Math.max(0, Math.min(index, options.length - 1));
  options.forEach((option, optionIndex) => {
    option.classList.toggle("searchable-option-active", optionIndex === activeMovementOption);
  });
  const activeOption = options[activeMovementOption];
  productInput.setAttribute("aria-activedescendant", activeOption.id);
  activeOption.scrollIntoView({ block: "nearest" });
}

function toggleMovementProduct(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return;
  if (selectedMovementProductIds.has(product.id)) {
    selectedMovementProductIds.delete(product.id);
    movementQuantities.delete(product.id);
  } else {
    const wasEmpty = selectedMovementProductIds.size === 0;
    selectedMovementProductIds.add(product.id);
    movementQuantities.set(product.id, "");
    if (wasEmpty && movementType.value === "masuk") {
      movementPrice.value = String(product.price);
    }
  }
  productInput.value = "";
  showAllMovementProducts = true;
  renderSelectedMovementProducts();
  renderMovementProductOptions();
  updateSelectedProduct();
  productInput.focus();
}

function openMovementProductOptions() {
  showAllMovementProducts = !productInput.value.trim();
  renderMovementProductOptions();
}

productInput.addEventListener("focus", openMovementProductOptions);
productInput.addEventListener("click", () => {
  if (productOptions.hidden) openMovementProductOptions();
});

productPicker.addEventListener("focusout", event => {
  if (!productPicker.contains(event.relatedTarget)) closeMovementProductOptions();
});

productInput.addEventListener("input", () => {
  showAllMovementProducts = false;
  renderMovementProductOptions();
});

productInput.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (productOptions.hidden) {
      showAllMovementProducts = false;
      renderMovementProductOptions();
    }
    const optionCount = productOptions.querySelectorAll('[role="option"]:not([aria-disabled="true"])').length;
    if (optionCount) {
      const nextIndex = activeMovementOption < 0
        ? (event.key === "ArrowDown" ? 0 : optionCount - 1)
        : activeMovementOption + (event.key === "ArrowDown" ? 1 : -1);
      setActiveMovementOption((nextIndex + optionCount) % optionCount);
    }
  } else if (event.key === "Enter" && !productOptions.hidden) {
    event.preventDefault();
    const activeOption = productOptions.querySelectorAll('[role="option"]:not([aria-disabled="true"])')[activeMovementOption];
    if (activeOption) toggleMovementProduct(activeOption.dataset.productId);
  } else if (event.key === "Escape" && !productOptions.hidden) {
    event.preventDefault();
    closeMovementProductOptions();
  }
});

productOptions.addEventListener("pointerdown", event => {
  if (event.target.closest(".searchable-option")) event.preventDefault();
});

productOptions.addEventListener("click", event => {
  const option = event.target.closest(".searchable-option");
  if (option) toggleMovementProduct(option.dataset.productId);
});

selectedProductsContainer.addEventListener("click", event => {
  const button = event.target.closest(".remove-selected-product");
  if (!button) return;
  selectedMovementProductIds.delete(button.dataset.productId);
  movementQuantities.delete(button.dataset.productId);
  renderSelectedMovementProducts();
  updateSelectedProduct();
});

selectedProductsContainer.addEventListener("input", event => {
  const input = event.target.closest(".selected-product-quantity");
  if (!input) return;
  movementQuantities.set(input.dataset.productId, input.value);
});

document.addEventListener("pointerdown", event => {
  if (!productPicker.contains(event.target)) closeMovementProductOptions();
});

productForm.addEventListener("submit", event => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const name = String(formData.get("name")).trim();
  const category = String(formData.get("category")).trim();
  const price = Number(formData.get("price"));
  const stock = Number(formData.get("quantity"));
  const date = String(formData.get("date"));

  if (state.products.some(product =>
    product.id !== editingProductId &&
    product.name.toLocaleLowerCase("id") === name.toLocaleLowerCase("id")
  )) {
    showToast("Nama barang sudah terdaftar.");
    return;
  }
  if (!name || !Number.isSafeInteger(price) || price < 0 ||
      !Number.isSafeInteger(stock) || stock < 0 || !date) {
    showToast("Periksa kembali nama, harga, stok, dan tanggal.");
    return;
  }

  if (editingProductId) {
    const product = state.products.find(item => item.id === editingProductId);
    if (!product) {
      resetProductForm();
      showToast("Barang tidak ditemukan. Silakan pilih barang kembali.");
      return;
    }
    const previousProduct = { ...product };
    const previousMovementCount = state.movements.length;
    product.name = name;
    product.category = category;
    product.price = price;
    product.stock = stock;
    if (stock !== previousProduct.stock) {
      addMovement(product, stock > previousProduct.stock ? "masuk" : "keluar",
        Math.abs(stock - previousProduct.stock), price, date);
    }
    try {
      saveState();
    } catch (error) {
      Object.assign(product, previousProduct);
      state.movements.length = previousMovementCount;
      console.error("Gagal memperbarui barang:", error);
      showToast("Data tidak dapat disimpan. Periksa ruang penyimpanan browser.");
      return;
    }
    resetProductForm();
    render();
    showToast("Barang berhasil diperbarui.");
    return;
  }

  const product = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category,
    price,
    stock
  };
  state.products.push(product);
  if (stock > 0) addMovement(product, "masuk", stock, price, date);
  try {
    saveState();
  } catch (error) {
    state.products.pop();
    if (stock > 0) state.movements.pop();
    console.error("Gagal menyimpan barang:", error);
    showToast("Data tidak dapat disimpan. Periksa ruang penyimpanan browser.");
    return;
  }
  resetProductForm();
  render();
  showToast("Barang berhasil ditambahkan.");
});

function resetProductForm() {
  editingProductId = null;
  productForm.reset();
  productForm.elements.date.value = localDate();
  productForm.elements.quantity.value = "0";
  productFormTitle.textContent = "Tambah barang";
  productStockLabel.textContent = "Stok awal";
  productSubmit.textContent = "Simpan barang";
  productCancel.hidden = true;
}

document.querySelector("#inventory-rows").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const product = state.products.find(item =>
    item.id === (button.dataset.addStock || button.dataset.editProduct || button.dataset.deleteProduct)
  );
  if (!product) return;

  if (button.dataset.addStock) {
    if (!Number.isSafeInteger(product.stock) || product.stock >= Number.MAX_SAFE_INTEGER) {
      showToast("Stok sudah mencapai batas maksimum.");
      return;
    }
    product.stock += 1;
    addMovement(product, "masuk", 1, product.price, localDate());
    try {
      saveState();
    } catch (error) {
      product.stock -= 1;
      state.movements.pop();
      console.error("Gagal menambah stok:", error);
      showToast("Stok tidak dapat disimpan. Periksa ruang penyimpanan browser.");
      return;
    }
    render();
    showToast("Stok barang berhasil ditambah 1.");
    return;
  }

  if (button.dataset.editProduct) {
    editingProductId = product.id;
    productForm.elements.name.value = product.name;
    productForm.elements.category.value = product.category;
    productForm.elements.price.value = String(product.price);
    productForm.elements.quantity.value = String(product.stock);
    productForm.elements.date.value = localDate();
    productFormTitle.textContent = "Edit barang";
    productStockLabel.textContent = "Stok saat ini";
    productSubmit.textContent = "Simpan perubahan";
    productCancel.hidden = false;
    productForm.elements.name.focus();
    return;
  }

  if (!window.confirm(`Hapus barang "${product.name}"? Riwayat transaksi tetap disimpan.`)) return;
  const productIndex = state.products.indexOf(product);
  state.products.splice(productIndex, 1);
  try {
    saveState();
  } catch (error) {
    state.products.splice(productIndex, 0, product);
    console.error("Gagal menghapus barang:", error);
    showToast("Barang tidak dapat dihapus. Periksa ruang penyimpanan browser.");
    return;
  }
  if (editingProductId === product.id) resetProductForm();
  render();
  showToast("Barang berhasil dihapus.");
});

productCancel.addEventListener("click", resetProductForm);

movementForm.addEventListener("submit", event => {
  event.preventDefault();
  const products = getSelectedMovementProducts();
  const type = movementType.value;
  const price = Number(movementPrice.value);
  const date = movementDate.value;

  if (!products.length) {
    showToast("Pilih setidaknya satu barang dari daftar.");
    return;
  }
  if (!date) {
    showToast("Tanggal transaksi wajib diisi.");
    return;
  }
  const movementItems = products.map(product => ({
    product,
    quantity: Number(movementQuantities.get(product.id))
  }));
  const invalidQuantityItem = movementItems.find(({ quantity }) =>
    !Number.isSafeInteger(quantity) || quantity < 1
  );
  if (invalidQuantityItem) {
    showToast(`Masukkan jumlah bulat positif untuk "${invalidQuantityItem.product.name}".`);
    return;
  }
  const insufficientProduct = type === "keluar"
    ? movementItems.find(({ product, quantity }) => quantity > product.stock)
    : null;
  if (insufficientProduct) {
    showToast(`Stok "${insufficientProduct.product.name}" tidak cukup. Tersedia: ${insufficientProduct.product.stock}.`);
    return;
  }
  if (type === "masuk" && (!Number.isSafeInteger(price) || price < 0)) {
    showToast("Harga harus berupa angka nol atau lebih.");
    return;
  }

  if (type === "masuk" && movementItems.some(({ product, quantity }) =>
    product.stock > Number.MAX_SAFE_INTEGER - quantity
  )) {
    showToast("Jumlah melebihi batas maksimum stok untuk salah satu barang.");
    return;
  }

  const previousProducts = products.map(product => ({
    product,
    stock: product.stock,
    price: product.price
  }));
  const previousMovementCount = state.movements.length;
  for (const { product, quantity } of movementItems) {
    const movementPriceValue = type === "masuk" ? price : product.price;
    product.stock += type === "masuk" ? quantity : -quantity;
    if (type === "masuk") product.price = price;
    addMovement(product, type, quantity, movementPriceValue, date);
  }
  try {
    saveState();
  } catch (error) {
    for (const previous of previousProducts) {
      previous.product.stock = previous.stock;
      previous.product.price = previous.price;
    }
    state.movements.length = previousMovementCount;
    console.error("Gagal menyimpan transaksi:", error);
    showToast("Transaksi tidak dapat disimpan. Periksa ruang penyimpanan browser.");
    return;
  }

  for (const product of products) movementQuantities.set(product.id, "");
  movementDate.value = localDate();
  render();
  showToast(`Pergerakan ${type} untuk ${products.length} barang berhasil dicatat.`);
});

movementType.addEventListener("change", updateSelectedProduct);
document.querySelector("#search").addEventListener("input", render);
historyFilter.addEventListener("change", render);

productForm.elements.date.value = localDate();
movementDate.value = localDate();
render();
