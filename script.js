
"use strict";

/* =========================
   QMR STORE — script.js
   ========================= */

const SUPABASE_URL =
  "https://awdreoevykuqouehbnkc.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable_pnPpAOR_2boEZ510v7rmyA_hdD_h1Se";

const $ = (selector, root = document) => root.querySelector(selector);

const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

let supabase = null;
let products = [];
let cart = loadCart();
let isSubmitting = false;
let selectedCategory = "all";

/* ---------- Cart storage ---------- */

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("qmr_cart") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem("qmr_cart", JSON.stringify(cart));
}

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} DA`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showToast(message) {
  const toast = $("#toast");
  if (toast) {
    toast.textContent = message;
    toast.classList.add("show");
    toast.setAttribute("aria-live", "polite");

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  } else {
    console.info("QMR:", message);
  }
}

/* ---------- Supabase connection ---------- */

function initSupabase() {
  if (!window.supabase?.createClient) {
    console.error("Supabase JavaScript library is missing.");
    return;
  }

  try {
    const config = window.QMR_CONFIG || {};

    const url =
      config.url ||
      config.supabaseUrl ||
      config.SUPABASE_URL ||
      SUPABASE_URL;

    const key =
      config.key ||
      config.anonKey ||
      config.publishableKey ||
      config.SUPABASE_KEY ||
      SUPABASE_PUBLIC_KEY;

    supabase = window.supabase.createClient(url, key);
  } catch (error) {
    console.error("QMR Supabase initialization error:", error);
    supabase = null;
  }
}

/* ---------- Products ---------- */

function productImage(product) {
  return (
    product.image_url ||
    product.image ||
    product.imageUrl ||
    product.photo ||
    ""
  );
}

function productId(product) {
  return String(product.id);
}

function productPrice(product) {
  return Number(product.price || 0);
}

function renderProducts(list = products) {
  const grid = $("#productGrid");
  const empty = $("#emptyProducts");

  if (!grid) {
    console.error("QMR: #productGrid was not found in the HTML.");
    return;
  }

  if (!list.length) {
    grid.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  grid.innerHTML = list.map(product => {
    const id = escapeHTML(productId(product));
    const name = escapeHTML(product.name || "Produit");
    const description = escapeHTML(product.description || "");
    const price = productPrice(product);
    const image = productImage(product);
    const fallbackImage = "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=80";

    return `
      <article class="product-card">
        <div class="product-image">
          ${
            image
              ? `<img src="${escapeHTML(image)}"
                      alt="${name}"
                      loading="lazy"
                      onerror="this.onerror=null;this.src='${fallbackImage}'">`
              : `<img src="${fallbackImage}" alt="${name}" loading="lazy">`
          }
        </div>

        <div class="product-info">
          <h3>${name}</h3>
          ${description ? `<p>${description}</p>` : ""}
          <p class="product-price">${money(price)}</p>

          <button
            type="button"
            class="add-to-cart"
            data-add-to-cart="${id}">
            Ajouter au panier
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function loadProducts() {
  const grid = $("#productGrid");

  if (grid) {
    grid.setAttribute("aria-busy", "true");
  }

  try {
    if (!supabase) {
      throw new Error("Connexion Supabase indisponible.");
    }

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    products = Array.isArray(data) ? data : [];
    renderProducts();
  } catch (error) {
    console.error("QMR product loading error:", error);

    products = [];
    renderProducts();

    if (grid) {
      grid.innerHTML = `
        <p class="store-error">
          تعذر تحميل المنتجات. تحقّق من الاتصال بقاعدة البيانات.
        </p>
      `;
    }
  } finally {
    if (grid) grid.removeAttribute("aria-busy");
  }
}

/* ---------- Cart operations ---------- */

function getCartDetails() {
  return cart.map(item => {
    const product = products.find(
      p => productId(p) === String(item.id)
    );

    if (!product) return null;

    const quantity = Math.max(
      1,
      Math.min(99, Math.floor(Number(item.qty) || 1))
    );

    return {
      product,
      quantity,
      subtotal: productPrice(product) * quantity
    };
  }).filter(Boolean);
}

function renderCart() {
  const container = $("#cartItems");
  const totalElement = $("#cartTotal");
  const details = getCartDetails();

  if (container) {
    if (!details.length) {
      container.innerHTML = "<p>السلة فارغة.</p>";
    } else {
      container.innerHTML = details.map(({ product, quantity, subtotal }) => `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong>${escapeHTML(product.name)}</strong>
            <p>${money(productPrice(product))}</p>
          </div>

          <div class="cart-item-actions">
            <button type="button"
                    data-cart-minus="${escapeHTML(productId(product))}"
                    aria-label="تقليل الكمية">−</button>

            <span>${quantity}</span>

            <button type="button"
                    data-cart-plus="${escapeHTML(productId(product))}"
                    aria-label="زيادة الكمية">+</button>

            <strong>${money(subtotal)}</strong>

            <button type="button"
                    data-cart-remove="${escapeHTML(productId(product))}"
                    aria-label="حذف المنتج">حذف</button>
          </div>
        </div>
      `).join("");
    }
  }

  const total = details.reduce((sum, item) => sum + item.subtotal, 0);

  if (totalElement) totalElement.textContent = money(total);

  const count = cart.reduce(
    (sum, item) => sum + Math.max(0, Number(item.qty) || 0),
    0
  );

  $$("[data-cart-count], #cartCount, .cart-count").forEach(element => {
    element.textContent = String(count);
  });

  saveCart();
}

function addToCart(id) {
  const product = products.find(p => productId(p) === String(id));

  if (!product) {
    showToast("هذا المنتج غير متوفر حاليًا.");
    return;
  }

  const existing = cart.find(item => String(item.id) === String(id));

  if (existing) {
    existing.qty = Math.min(99, Number(existing.qty || 1) + 1);
  } else {
    cart.push({ id: String(id), qty: 1 });
  }

  renderCart();
  showToast("تمت إضافة المنتج إلى السلة.");
}

function changeQuantity(id, difference) {
  const item = cart.find(entry => String(entry.id) === String(id));
  if (!item) return;

  item.qty = Number(item.qty || 1) + difference;

  if (item.qty <= 0) {
    cart = cart.filter(entry => String(entry.id) !== String(id));
  } else {
    item.qty = Math.min(99, item.qty);
  }

  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(item => String(item.id) !== String(id));
  renderCart();
}

/* ---------- Cart drawer ---------- */

function openCart() {
  $("#cartDrawer")?.classList.add("open");
  $("#cartOverlay")?.classList.add("show");
  $("#cartDrawer")?.setAttribute("aria-hidden", "false");
}

function closeCart() {
  $("#cartDrawer")?.classList.remove("open");
  $("#cartOverlay")?.classList.remove("show");
  $("#cartDrawer")?.setAttribute("aria-hidden", "true");
}

/* ---------- Product filtering ---------- */

function updateCategoryButtons() {
  $$(".filter-chip[data-filter]").forEach(button => {
    const active = String(button.dataset.filter || "all").toLowerCase() === selectedCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function filterProducts() {
  const searchInput = $(
    "#searchInput, #productSearch, [data-product-search]"
  );

  const categoryInput = $(
    "#categoryFilter, #productCategory, [data-category-filter]"
  );

  const search = String(searchInput?.value || "")
    .trim()
    .toLowerCase();

  const category = String(categoryInput?.value || selectedCategory || "all")
    .trim()
    .toLowerCase();

  const filtered = products.filter(product => {
    const name = String(product.name || "").toLowerCase();
    const description = String(product.description || "").toLowerCase();
    const rawCategory = String(product.category || product.gender || product.type || "").toLowerCase().trim();
    const productCategory = /women|woman|female|نساء|امرأة|نسائي/.test(rawCategory) ? "women" :
      /girls|girl|بنات|بنت|طفلات/.test(rawCategory) ? "girls" : rawCategory;

    const matchesSearch =
      !search ||
      name.includes(search) ||
      description.includes(search);

    const matchesCategory =
      !category ||
      category === "all" ||
      category === "tous" ||
      productCategory === category;

    return matchesSearch && matchesCategory;
  });

  renderProducts(filtered);
}

/* ---------- Checkout validation ---------- */

function validateOrder(data) {
  const customerName = String(data.customer_name || "").trim();
  const phone = String(data.phone || "")
    .trim()
    .replace(/[\s()-]/g, "");
  const wilaya = String(data.wilaya || "").trim();
  const address = String(data.address || "").trim();

  if (customerName.length < 2 || customerName.length > 100) {
    throw new Error("يرجى إدخال الاسم بشكل صحيح.");
  }

  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    throw new Error("يرجى إدخال رقم هاتف صحيح.");
  }

  if (wilaya.length < 2 || wilaya.length > 80) {
    throw new Error("يرجى اختيار أو إدخال الولاية.");
  }

  if (address.length < 4 || address.length > 500) {
    throw new Error("يرجى إدخال عنوان التوصيل بشكل صحيح.");
  }

  return { customerName, phone, wilaya, address };
}

/* ---------- Submit order ---------- */

async function submitOrder(event) {
  event.preventDefault();

  if (isSubmitting) return;

  const form = event.currentTarget;
  const message = $("#checkoutMessage");
  const submitButton = form.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  const setMessage = (text, success = false) => {
    if (!message) return;
    message.textContent = text;
    message.style.color = success ? "#42704d" : "#a33";
    message.setAttribute("role", "status");
  };

  try {
    if (!supabase) {
      throw new Error("تعذر الاتصال بقاعدة البيانات.");
    }

    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());

    const customer = validateOrder(values);
    const details = getCartDetails();

    if (!details.length) {
      throw new Error("أضف منتجًا واحدًا على الأقل إلى السلة.");
    }

    const lines = details.map(({ product, quantity }) => ({
      product_id: productId(product),
      name: String(product.name),
      price: productPrice(product),
      quantity
    }));

    const total = lines.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (!Number.isFinite(total) || total < 0) {
      throw new Error("تعذر حساب إجمالي الطلب.");
    }

    const order = {
      customer_name: customer.customerName,
      phone: customer.phone,
      wilaya: customer.wilaya,
      address: customer.address,
      notes: String(values.notes || "").trim(),
      items: lines,
      total,
      status: "new",
      payment_method: "cash_on_delivery"
    };

    isSubmitting = true;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ إرسال الطلب...";
    }

    setMessage("جارٍ إرسال طلبك...");

    /*
      لا نستخدم select() بعد insert().
      هذا يمنع الحاجة إلى منح الزوار صلاحية قراءة الطلبات.
    */
    const { error } = await supabase
      .from("orders")
      .insert(order);

    if (error) throw error;

    cart = [];
    saveCart();
    renderCart();
    form.reset();
    closeCart();

    setMessage(
      "تم استلام طلبك بنجاح! سنتواصل معك لتأكيده.",
      true
    );

    showToast("تم إرسال الطلب بنجاح.");
  } catch (error) {
    console.error("QMR order submission error:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint
    });

    /*
      رسالة مؤقتة للتشخيص:
      تعرض سبب الخطأ الحقيقي لتسهيل إصلاح Supabase.
    */
    const detail = [
      error?.message || "خطأ غير معروف",
      error?.code ? `الرمز: ${error.code}` : ""
    ].filter(Boolean).join(" — ");

    setMessage(`تعذر إرسال الطلب: ${detail}`);
  } finally {
    isSubmitting = false;

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "تأكيد الطلب — الدفع عند الاستلام";
    }
  }
}

/* ---------- Event listeners ---------- */

function setupEvents() {
  $("#checkoutForm")?.addEventListener("submit", submitOrder);

  $("#openCart")?.addEventListener("click", openCart);
  $("#closeCart")?.addEventListener("click", closeCart);
  $("#cartOverlay")?.addEventListener("click", closeCart);

  const menuToggle = $("#menuToggle");
  const mainNav = $("#mainNav");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = mainNav?.classList.toggle("open") || false;
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "إغلاق القائمة" : "فتح القائمة");
  });

  mainNav?.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (link) {
      mainNav.classList.remove("open");
      menuToggle?.setAttribute("aria-expanded", "false");
      menuToggle?.setAttribute("aria-label", "فتح القائمة");
      if (link.getAttribute("href") === "#women" || link.getAttribute("href") === "#girls") {
        event.preventDefault();
        selectedCategory = link.getAttribute("href") === "#women" ? "women" : "girls";
        updateCategoryButtons();
        filterProducts();
        $("#products")?.scrollIntoView({ behavior: "smooth" });
      }
    }
  });

  $$(".filter-chip[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      selectedCategory = String(button.dataset.filter || "all").toLowerCase();
      updateCategoryButtons();
      filterProducts();
    });
  });

  // Close the mobile menu when tapping outside it.
  document.addEventListener("click", event => {
    if (!event.target.closest(".site-header") && mainNav?.classList.contains("open")) {
      mainNav.classList.remove("open");
      menuToggle?.setAttribute("aria-expanded", "false");
      menuToggle?.setAttribute("aria-label", "فتح القائمة");
    }
  });

  document.addEventListener("click", event => {
    const addButton = event.target.closest("[data-add-to-cart]");
    if (addButton) {
      addToCart(addButton.dataset.addToCart);
      return;
    }

    const plusButton = event.target.closest("[data-cart-plus]");
    if (plusButton) {
      changeQuantity(plusButton.dataset.cartPlus, 1);
      return;
    }

    const minusButton = event.target.closest("[data-cart-minus]");
    if (minusButton) {
      changeQuantity(minusButton.dataset.cartMinus, -1);
      return;
    }

    const removeButton = event.target.closest("[data-cart-remove]");
    if (removeButton) {
      removeFromCart(removeButton.dataset.cartRemove);
    }
  });

  $$("#searchInput, #productSearch, [data-product-search]").forEach(input => {
    input.addEventListener("input", filterProducts);
  });

  $$("#categoryFilter, #productCategory, [data-category-filter]").forEach(input => {
    input.addEventListener("change", filterProducts);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeCart();
  });

  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());
}

/* ---------- Start ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  initSupabase();
  setupEvents();
  renderCart();
  await loadProducts();
});
