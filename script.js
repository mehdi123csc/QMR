(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const money = n => `${Number(n || 0).toLocaleString("fr-DZ")} دج`;
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const demoProducts = [
    {id:"demo-1",name:"فستان سهرة أنيق",category:"women",price:6800,old_price:7800,description:"إطلالة راقية للمناسبات",image_url:"https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-2",name:"طقم يومي ناعم",category:"women",price:4200,description:"راحة وأناقة لكل يوم",image_url:"https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-3",name:"بلوزة كلاسيكية",category:"women",price:2900,description:"قطعة أساسية بتفاصيل جميلة",image_url:"https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-4",name:"فستان بناتي",category:"girls",price:3500,description:"لمسة لطيفة للمناسبات",image_url:"https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-5",name:"إطلالة عصرية",category:"women",price:5100,description:"تصميم أنيق لإطلالة مميزة",image_url:"https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-6",name:"طقم بناتي أنيق",category:"girls",price:3200,description:"أناقة وراحة في قطعة واحدة",image_url:"https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-7",name:"قميص أنيق",category:"women",price:3100,description:"يناسب إطلالات متعددة",image_url:"https://images.unsplash.com/photo-1598554747436-c9293d6a588f?auto=format&fit=crop&w=700&q=80",active:true},
    {id:"demo-8",name:"فستان يومي للبنات",category:"girls",price:2800,description:"تصميم لطيف وسهل التنسيق",image_url:"https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=700&q=80",active:true}
  ];
  let products = [...demoProducts], filter = "all", supabase = null, appliedCoupon = null, favoritesOnly = false, productSort = "newest", searchQuery = "";
  let favorites = new Set();
  try { const savedFavorites = JSON.parse(localStorage.getItem("qmr-favorites") || "[]"); if (Array.isArray(savedFavorites)) favorites = new Set(savedFavorites.map(String)); } catch { favorites = new Set(); }
  let cart = [];
  try {
    const saved = JSON.parse(localStorage.getItem("qmr-cart") || "[]");
    cart = Array.isArray(saved) ? saved.filter(x => x && x.id != null && Number.isInteger(Number(x.qty)) && Number(x.qty) > 0 && Number(x.qty) <= 99).map(x => ({...x, qty:Number(x.qty)})) : [];
  } catch { cart=[]; }
  const cfg = window.QMR_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) {
    try { supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); } catch(e) { console.warn("Supabase config could not initialize."); }
  }
  function toast(message) { const el=$("#toast"); if(!el)return; el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
  function persistCart(){
    try { localStorage.setItem("qmr-cart",JSON.stringify(cart)); }
    catch(e) { console.warn("Cart could not be saved in this browser."); }
    renderCart();
  }
  async function loadProducts(){
    if(supabase){
      try { const {data,error}=await supabase.from("products").select("id,name,category,price,old_price,description,image_url,images,stock_quantity,active").eq("active",true).order("created_at",{ascending:false}); if(error) throw error; products=data||[]; }
      catch(e){ console.warn("Products could not be loaded from Supabase; showing sample products.",e.message); products=[...demoProducts]; const notice=$("#connectionNotice"); if(notice) notice.hidden=false; }
    }
    renderProducts();
  }
  function renderProducts(){
    const grid=$("#productGrid"); if(!grid)return;
    let visible=products.filter(p=>p.active!==false && (filter==="all"||p.category===filter));
    if(searchQuery) visible=visible.filter(p=>`${p.name||""} ${p.description||""}`.toLocaleLowerCase("ar").includes(searchQuery));
    if(favoritesOnly) visible=visible.filter(p=>favorites.has(String(p.id)));
    if(productSort==="price-asc") visible.sort((a,b)=>Number(a.price)-Number(b.price));
    else if(productSort==="price-desc") visible.sort((a,b)=>Number(b.price)-Number(a.price));
    else if(productSort==="name") visible.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ar"));
    const favCount=$("#favoritesCount"); if(favCount) favCount.textContent=String(favorites.size);
    grid.innerHTML=visible.map(p=>`<article class="product-card"><div class="product-image"><img id="productMain-${safe(p.id)}" data-product-image="${safe(p.id)}" loading="lazy" src="${safe(p.image_url||"qmr-logo.jpg")}" alt="${safe(p.name)}" onerror="this.src='assets/qmr-logo.jpg'"><span class="product-tag">${p.category==="girls"?"GIRLS EDIT":"WOMEN EDIT"}</span><button type="button" class="favorite-button ${favorites.has(String(p.id))?"is-favorite":""}" data-favorite="${safe(p.id)}" aria-label="${favorites.has(String(p.id))?"إزالة من المفضّلة":"إضافة إلى المفضّلة"}" aria-pressed="${favorites.has(String(p.id))}">${favorites.has(String(p.id))?"♥":"♡"}</button><button class="add-button" data-add="${safe(p.id)}" ${Number.isFinite(Number(p.stock_quantity))&&Number(p.stock_quantity)<=0?"disabled":""}>${Number.isFinite(Number(p.stock_quantity))&&Number(p.stock_quantity)<=0?"نفد المخزون":"أضيفي إلى السلة +"}</button></div>${Array.isArray(p.images)&&p.images.filter(u=>u&&u!==p.image_url).length?`<div class="product-thumbs">${p.images.filter(u=>u&&u!==p.image_url).slice(0,3).map((u,i)=>`<button type="button" data-gallery-image="${safe(p.id)}" data-image-url="${safe(u)}" aria-label="صورة إضافية ${i+1}"><img loading="lazy" src="${safe(u)}" alt=""></button>`).join("")}</div>`:""}<div class="product-info"><h3>${safe(p.name)}</h3><p>${safe(p.description||"اختيار أنيق من Qmr")}</p><span class="price">${money(p.price)}</span>${p.old_price?`<span class="old-price">${money(p.old_price)}</span>`:""}</div></article>`).join("");
    const empty=$("#emptyProducts");empty.hidden=visible.length>0;if(!visible.length){grid.innerHTML="";empty.textContent=favoritesOnly?"ما زال ما حفظتي حتى منتج في المفضّلة، اضغطي على ♡ في أي منتج باش تحفظيه.":searchQuery?"ما لقيناش منتجات تطابق البحث. جرّبي كلمة أخرى.":"لا توجد منتجات في هذا القسم حاليًا. عودي قريبًا لاكتشاف الجديد.";}
  }
  function openCart(){ $("#cartDrawer").classList.add("open");$("#cartOverlay").classList.add("show");$("#cartDrawer").setAttribute("aria-hidden","false");document.body.classList.add("no-scroll"); }
  function closeCart(){ $("#cartDrawer").classList.remove("open");$("#cartOverlay").classList.remove("show");$("#cartDrawer").setAttribute("aria-hidden","true");document.body.classList.remove("no-scroll"); }
  function calcDiscount(subtotal){if(!appliedCoupon)return 0;const v=Number(appliedCoupon.discount_value)||0;return Math.min(subtotal,appliedCoupon.discount_type==="percent"?subtotal*Math.min(100,v)/100:v);}
  function renderCart(){
    const items=$("#cartItems"); if(!items)return;
    const enriched=cart.map(c=>({...c,qty:Math.max(1,Math.min(99,Number(c.qty)||1)),product:products.find(p=>String(p.id)===String(c.id))||c.productSnapshot||demoProducts.find(p=>p.id===c.id)})).filter(c=>c.product);
    $("#cartCount").textContent=cart.reduce((n,c)=>n+Number(c.qty||0),0);
    items.innerHTML=enriched.length?enriched.map(c=>`<div class="cart-line"><img src="${safe(c.product.image_url||"qmr-logo.jpg")}" alt=""><div><h4>${safe(c.product.name)}</h4><p>${money(c.product.price)}</p><div class="quantity"><button data-qty="${safe(c.id)}" data-delta="-1" aria-label="تقليل الكمية">−</button><span>${c.qty}</span><button data-qty="${safe(c.id)}" data-delta="1" aria-label="زيادة الكمية">+</button></div></div><button class="remove-item" data-remove="${safe(c.id)}" aria-label="حذف المنتج">حذف</button></div>`).join(""):`<p class="loading-state">سلتك فارغة حاليًا. اختاري قطعة تحبينها.</p>`;
    const total=enriched.reduce((sum,c)=>sum+Number(c.product.price||0)*c.qty,0);const discount=calcDiscount(total);$("#cartSubtotal").textContent=money(total);$("#cartDiscount").textContent="−"+money(discount);$("#discountRow").hidden=discount<=0;$("#cartTotal").textContent=money(Math.max(0,total-discount));
  }
  function addProduct(id){ const p=products.find(x=>String(x.id)===String(id));if(!p)return;if(Number.isFinite(Number(p.stock_quantity))&&cart.find(x=>String(x.id)===String(id))?.qty>=Number(p.stock_quantity)){toast("الكمية المتوفرة في المخزون غير كافية");return;}if(Number.isFinite(Number(p.stock_quantity))&&Number(p.stock_quantity)<=0){toast("هذا المنتج غير متوفر حاليًا");return;}const item=cart.find(x=>String(x.id)===String(id));if(item){if(item.qty>=99){toast("الحد الأقصى للكمية هو 99");return;}const p=products.find(x=>String(x.id)===String(id));if(p&&Number.isFinite(Number(p.stock_quantity))&&item.qty>=Number(p.stock_quantity)){toast("الكمية المتوفرة في المخزون غير كافية");return;}item.qty++;}else cart.push({id:p.id,qty:1,productSnapshot:p});persistCart();toast("أُضيف المنتج إلى سلتك"); }
  document.addEventListener("click", e=>{
    const galleryThumb=e.target.closest("[data-gallery-image]");if(galleryThumb){const main=$("#productMain-"+CSS.escape(galleryThumb.dataset.galleryImage));if(main)main.src=galleryThumb.dataset.imageUrl;return;}
    const productImage=e.target.closest("[data-product-image]");
    if(productImage){const p=products.find(x=>String(x.id)===String(productImage.dataset.productImage));if(p){const modal=$("#imageLightbox");$("#lightboxImage").src=productImage.src||p.image_url||"qmr-logo.jpg";$("#lightboxImage").alt=p.name||"صورة المنتج";$("#lightboxCaption").textContent=`${p.name||"المنتج"} — ${money(p.price)}`;modal.hidden=false;document.body.classList.add("lightbox-open");}return;}
    const fav=e.target.closest("[data-favorite]");if(fav){const id=String(fav.dataset.favorite);if(favorites.has(id))favorites.delete(id);else favorites.add(id);try{localStorage.setItem("qmr-favorites",JSON.stringify([...favorites]));}catch{}renderProducts();return;}
    const add=e.target.closest("[data-add]"); if(add){addProduct(add.dataset.add);return;}
    const qty=e.target.closest("[data-qty]");if(qty){const item=cart.find(x=>String(x.id)===String(qty.dataset.qty));if(item){const delta=Number(qty.dataset.delta);const product=products.find(x=>String(x.id)===String(item.id));if(delta>0&&product&&Number.isFinite(Number(product.stock_quantity))&&item.qty>=Number(product.stock_quantity)){toast("الكمية المتوفرة في المخزون غير كافية");return;}item.qty+=delta;if(item.qty<1)cart=cart.filter(x=>x!==item);else item.qty=Math.min(99,item.qty);persistCart();}return;}
    const remove=e.target.closest("[data-remove]");if(remove){cart=cart.filter(x=>String(x.id)!==String(remove.dataset.remove));persistCart();return;}
    const f=e.target.closest("[data-filter]");if(f){filter=f.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===f));renderProducts();}
  });
  $("#productSearch")?.addEventListener("input",e=>{searchQuery=String(e.target.value||"").trim().toLocaleLowerCase("ar");renderProducts();});
  $("#productSort")?.addEventListener("change",e=>{productSort=e.target.value;renderProducts();});
  $("#favoritesOnly")?.addEventListener("click",e=>{favoritesOnly=!favoritesOnly;e.currentTarget.classList.toggle("active",favoritesOnly);e.currentTarget.setAttribute("aria-pressed",String(favoritesOnly));renderProducts();});
  $("#promoOpenCart")?.addEventListener("click",openCart);
  $("#openCart").addEventListener("click",openCart);$("#closeCart").addEventListener("click",closeCart);$("#cartOverlay").addEventListener("click",closeCart);
  $("#menuToggle").addEventListener("click",()=>$("#mainNav").classList.toggle("open"));
  $("#mainNav").addEventListener("click",e=>{if(e.target.closest("a"))$("#mainNav").classList.remove("open")});
  $("#closeLightbox").addEventListener("click",()=>{ $("#imageLightbox").hidden=true;document.body.classList.remove("lightbox-open");$("#lightboxImage").src=""; });
  $("#imageLightbox").addEventListener("click",e=>{if(e.target.id==="imageLightbox"){$("#imageLightbox").hidden=true;document.body.classList.remove("lightbox-open");$("#lightboxImage").src="";}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#imageLightbox").hidden){$("#imageLightbox").hidden=true;document.body.classList.remove("lightbox-open");$("#lightboxImage").src="";}});
  $("#year").textContent=new Date().getFullYear();
  $("#checkoutForm").addEventListener("submit",async e=>{
    e.preventDefault(); const checkoutForm=e.currentTarget; const msg=$("#checkoutMessage");msg.textContent="";msg.style.color="#9a6a42";
    if(!cart.length){msg.textContent="أضيفي منتجًا إلى السلة أولًا.";return;}
    const form=new FormData(checkoutForm), data=Object.fromEntries(form.entries());
    if(String(data.coupon_code||"").trim()&&!appliedCoupon){msg.textContent="اضغطي «تطبيق» للتحقق من كوبون التخفيض قبل تأكيد الطلب.";return;}
    const phone=String(data.phone||"").replace(/[\s()-]/g,"");
    if(!/^\+?[0-9]{8,15}$/.test(phone)){msg.textContent="تحققي من رقم الهاتف، ثم حاولي مجددًا.";return;}
    const lines=cart.map(c=>{const p=products.find(x=>String(x.id)===String(c.id))||c.productSnapshot;return p?{product_id:String(p.id),name:String(p.name),price:Number(p.price),quantity:Number(c.qty)}:null}).filter(Boolean);
    const subtotal=lines.reduce((s,p)=>s+p.price*p.quantity,0);const total=Math.max(0,subtotal-calcDiscount(subtotal));
    const order={customer_name:String(data.customer_name).trim(),phone,wilaya:String(data.wilaya).trim(),municipality:String(data.municipality||"").trim(),address:String(data.address).trim(),coupon_code:appliedCoupon?.code||"",notes:String(data.notes||"").trim(),items:lines,total,status:"new",payment_method:"cash_on_delivery"};
    const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="جارٍ إرسال الطلب...";
    try{
      if(supabase){
        const {data:placed,error}=await supabase.rpc("qmr_place_order",{p_order:order,p_coupon_code:order.coupon_code||null});if(error)throw error;if(placed?.error)throw new Error(placed.error);if(placed?.success===false)throw new Error(placed.message||"تعذر تأكيد الطلب");
        cart=[];appliedCoupon=null;persistCart();checkoutForm.reset();msg.style.color="#42704d";msg.textContent="تم استلام طلبك بنجاح! سنتواصل معك لتأكيده.";toast("تم إرسال الطلب بنجاح");
      }else{
        msg.style.color="#a33";msg.textContent="لم يتم ربط قاعدة البيانات بعد؛ لم يُرسل الطلب. أكملي إعداد Supabase من ملف README قبل استقبال العملاء.";
      }
    }catch(err){console.error("Qmr checkout error:",err);msg.style.color="#a33";
      const code=String(err?.code||"");
      if(!navigator.onLine) msg.textContent="لا يوجد اتصال بالإنترنت. تحققي من الاتصال ثم أعيدي إرسال الطلب.";
      else if(/qmr_place_order|function.*does not exist/i.test(String(err?.message||""))) msg.textContent="يلزم تشغيل ملف supabase-global-upgrade.sql في Supabase أولًا لتفعيل التحقق الآمن من المخزون والكوبونات.";
      else if(/coupon|كوبون|stock|مخزون|نفد/i.test(String(err?.message||""))) msg.textContent=err.message;
      else if(code==="42501"||/row-level security|permission denied/i.test(String(err?.message||""))) msg.textContent="إعدادات استقبال الطلبات في قاعدة البيانات تمنع الإرسال. يلزم مراجعة سياسة Visitors create orders في Supabase.";
      else if(code==="23514"||code==="23502"||code==="22P02") msg.textContent="بعض بيانات الطلب غير مقبولة. راجعي الاسم ورقم الهاتف والولاية والعنوان ثم أعيدي المحاولة.";
      else msg.textContent="تعذر إرسال الطلب. لم يتم تأكيده؛ حاولي مجددًا بعد التأكد من الاتصال. إذا تكررت المشكلة، أرسلي للمسؤول رمز الخطأ: "+(code||"غير متوفر");
    }
    finally{submit.disabled=false;submit.textContent="تأكيد الطلب — الدفع عند الاستلام";}
  });

  const algerianWilayas=["أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار","البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر","الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة","قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض","إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي","خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت","غرداية","غليزان","تيميمون","برج باجي مختار","أولاد جلال","بني عباس","عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة"];
  const wilayaSelect=$("#wilayaSelect"), municipalitySelect=$("#municipalityInput");
  if(wilayaSelect)wilayaSelect.innerHTML='<option value="">اختاري الولاية</option>'+algerianWilayas.map(w=>`<option value="${safe(w)}">${safe(w)}</option>`).join("");
  let localityRows=[];
  async function loadAlgerianLocalities(){
    if(!wilayaSelect||!municipalitySelect)return;
    try{
      const res=await fetch("https://raw.githubusercontent.com/wadiemendja/algeria-communes-wilayas/main/algeria-communes-69-wilayas.json",{cache:"force-cache"});if(!res.ok)throw new Error("locality data unavailable");
      const rows=await res.json();if(!Array.isArray(rows)||rows.length<1000)throw new Error("locality data invalid");localityRows=rows;
      const wilayas=[...new Map(rows.map(r=>[r.wilaya_code,r])).values()].sort((a,b)=>Number(a.wilaya_code)-Number(b.wilaya_code));
      wilayaSelect.innerHTML='<option value="">اختاري الولاية</option>'+wilayas.map(w=>`<option value="${safe(w.wilaya_name)}" data-code="${safe(w.wilaya_code)}">${safe(w.wilaya_code)} — ${safe(w.wilaya_name)}</option>`).join("");
      municipalitySelect.disabled=true;municipalitySelect.innerHTML='<option value="">اختاري الولاية أولًا</option>';
      wilayaSelect.addEventListener("change",()=>{const code=wilayaSelect.selectedOptions[0]?.dataset.code||"";const towns=localityRows.filter(r=>r.wilaya_code===code).sort((a,b)=>a.commune_name.localeCompare(b.commune_name,"ar"));municipalitySelect.innerHTML='<option value="">اختاري البلدية</option>'+towns.map(t=>`<option value="${safe(t.commune_name)}">${safe(t.commune_name)}</option>`).join("");municipalitySelect.disabled=!code||!towns.length;});
    }catch(e){console.warn("Algerian locality list could not be loaded; allowing manual entry.");const input=document.createElement("input");input.id="municipalityInput";input.name="municipality";input.required=true;input.maxLength=100;input.placeholder="اكتبي اسم البلدية";municipalitySelect.replaceWith(input);}
  }
  loadAlgerianLocalities();
  $("#applyCoupon")?.addEventListener("click",async()=>{const code=$("#couponCode").value.trim().toUpperCase(),msg=$("#couponMessage");msg.textContent="";if(!code){appliedCoupon=null;renderCart();msg.textContent="أدخلي رمز الكوبون.";return;}if(!supabase){msg.textContent="تعذر التحقق من الكوبون دون الاتصال بقاعدة البيانات.";return;}const subtotal=cart.reduce((sum,c)=>{const p=products.find(x=>String(x.id)===String(c.id))||c.productSnapshot;return sum+(Number(p?.price)||0)*Number(c.qty||0)},0);try{const {data,error}=await supabase.rpc("qmr_preview_coupon",{p_code:code,p_subtotal:subtotal});if(error)throw error;if(!data?.valid)throw new Error(data?.message||"الكوبون غير صالح أو منتهي الصلاحية.");appliedCoupon={code,discount_type:data.discount_type,discount_value:Number(data.discount_value)};renderCart();msg.textContent="تم تطبيق الكوبون. سيُعاد التحقق منه عند تأكيد الطلب.";msg.style.color="#42704d";}catch(err){appliedCoupon=null;renderCart();msg.textContent=err.message||"تعذر التحقق من الكوبون.";msg.style.color="#9a453a";}});
  $("#couponCode")?.addEventListener("input",()=>{appliedCoupon=null;renderCart();$("#couponMessage").textContent="";});

  loadProducts().then(renderCart);
})(); 
