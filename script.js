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
  let products = [...demoProducts], filter = "all", supabase = null;
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
      try { const {data,error}=await supabase.from("products").select("id,name,category,price,old_price,description,image_url,active").eq("active",true).order("created_at",{ascending:false}); if(error) throw error; products=data||[]; }
      catch(e){ console.warn("Products could not be loaded from Supabase; showing sample products.",e.message); products=[...demoProducts]; const notice=$("#connectionNotice"); if(notice) notice.hidden=false; }
    }
    renderProducts();
  }
  function renderProducts(){
    const grid=$("#productGrid"); if(!grid)return;
    const visible=products.filter(p=>p.active!==false && (filter==="all"||p.category===filter));
    grid.innerHTML=visible.map(p=>`<article class="product-card"><div class="product-image"><img loading="lazy" src="${safe(p.image_url||"assets/qmr-logo.jpg")}" alt="${safe(p.name)}" onerror="this.src='assets/qmr-logo.jpg'"><span class="product-tag">${p.category==="girls"?"GIRLS EDIT":"WOMEN EDIT"}</span><button class="add-button" data-add="${safe(p.id)}">أضيفي إلى السلة +</button></div><div class="product-info"><h3>${safe(p.name)}</h3><p>${safe(p.description||"اختيار أنيق من Qmr")}</p><span class="price">${money(p.price)}</span>${p.old_price?`<span class="old-price">${money(p.old_price)}</span>`:""}</div></article>`).join("");
    $("#emptyProducts").hidden=visible.length>0;
    if(!visible.length) grid.innerHTML="";
  }
  function openCart(){ $("#cartDrawer").classList.add("open");$("#cartOverlay").classList.add("show");$("#cartDrawer").setAttribute("aria-hidden","false");document.body.classList.add("no-scroll"); }
  function closeCart(){ $("#cartDrawer").classList.remove("open");$("#cartOverlay").classList.remove("show");$("#cartDrawer").setAttribute("aria-hidden","true");document.body.classList.remove("no-scroll"); }
  function renderCart(){
    const items=$("#cartItems"); if(!items)return;
    const enriched=cart.map(c=>({...c,qty:Math.max(1,Math.min(99,Number(c.qty)||1)),product:products.find(p=>String(p.id)===String(c.id))||c.productSnapshot||demoProducts.find(p=>p.id===c.id)})).filter(c=>c.product);
    $("#cartCount").textContent=cart.reduce((n,c)=>n+Number(c.qty||0),0);
    items.innerHTML=enriched.length?enriched.map(c=>`<div class="cart-line"><img src="${safe(c.product.image_url||"assets/qmr-logo.jpg")}" alt=""><div><h4>${safe(c.product.name)}</h4><p>${money(c.product.price)}</p><div class="quantity"><button data-qty="${safe(c.id)}" data-delta="-1" aria-label="تقليل الكمية">−</button><span>${c.qty}</span><button data-qty="${safe(c.id)}" data-delta="1" aria-label="زيادة الكمية">+</button></div></div><button class="remove-item" data-remove="${safe(c.id)}" aria-label="حذف المنتج">حذف</button></div>`).join(""):`<p class="loading-state">سلتك فارغة حاليًا. اختاري قطعة تحبينها.</p>`;
    const total=enriched.reduce((sum,c)=>sum+Number(c.product.price||0)*c.qty,0); $("#cartTotal").textContent=money(total);
  }
  function addProduct(id){ const p=products.find(x=>String(x.id)===String(id));if(!p)return;const item=cart.find(x=>String(x.id)===String(id));if(item){if(item.qty>=99){toast("الحد الأقصى للكمية هو 99");return;}item.qty++;}else cart.push({id:p.id,qty:1,productSnapshot:p});persistCart();toast("أُضيف المنتج إلى سلتك"); }
  document.addEventListener("click", e=>{
    const add=e.target.closest("[data-add]"); if(add){addProduct(add.dataset.add);return;}
    const qty=e.target.closest("[data-qty]");if(qty){const item=cart.find(x=>String(x.id)===String(qty.dataset.qty));if(item){item.qty+=Number(qty.dataset.delta);if(item.qty<1)cart=cart.filter(x=>x!==item);else item.qty=Math.min(99,item.qty);persistCart();}return;}
    const remove=e.target.closest("[data-remove]");if(remove){cart=cart.filter(x=>String(x.id)!==String(remove.dataset.remove));persistCart();return;}
    const f=e.target.closest("[data-filter]");if(f){filter=f.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===f));renderProducts();}
  });
  $("#openCart").addEventListener("click",openCart);$("#closeCart").addEventListener("click",closeCart);$("#cartOverlay").addEventListener("click",closeCart);
  $("#menuToggle").addEventListener("click",()=>$("#mainNav").classList.toggle("open"));
  $("#mainNav").addEventListener("click",e=>{if(e.target.closest("a"))$("#mainNav").classList.remove("open")});
  $("#year").textContent=new Date().getFullYear();
  $("#checkoutForm").addEventListener("submit",async e=>{
    e.preventDefault(); const msg=$("#checkoutMessage");msg.textContent="";msg.style.color="#9a6a42";
    if(!cart.length){msg.textContent="أضيفي منتجًا إلى السلة أولًا.";return;}
    const form=new FormData(e.currentTarget), data=Object.fromEntries(form.entries());
    const phone=String(data.phone||"").replace(/[\s()-]/g,"");
    if(!/^\+?[0-9]{8,15}$/.test(phone)){msg.textContent="تحققي من رقم الهاتف، ثم حاولي مجددًا.";return;}
    const lines=cart.map(c=>{const p=products.find(x=>String(x.id)===String(c.id))||c.productSnapshot;return p?{product_id:String(p.id),name:String(p.name),price:Number(p.price),quantity:Number(c.qty)}:null}).filter(Boolean);
    const total=lines.reduce((s,p)=>s+p.price*p.quantity,0);
    const order={customer_name:String(data.customer_name).trim(),phone,wilaya:String(data.wilaya).trim(),address:String(data.address).trim(),notes:String(data.notes||"").trim(),items:lines,total,status:"new",payment_method:"cash_on_delivery"};
    const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="جارٍ إرسال الطلب...";
    try{
      if(supabase){
        const {error}=await supabase.from("orders").insert(order);if(error)throw error;
        cart=[];persistCart();e.currentTarget.reset();msg.style.color="#42704d";msg.textContent="تم استلام طلبك بنجاح! سنتواصل معك لتأكيده.";toast("تم إرسال الطلب بنجاح");
      }else{
        msg.style.color="#a33";msg.textContent="لم يتم ربط قاعدة البيانات بعد؛ لم يُرسل الطلب. أكملي إعداد Supabase من ملف README قبل استقبال العملاء.";
      }
    }catch(err){console.error(err);msg.style.color="#a33";msg.textContent="تعذر إرسال الطلب. تحققي من الاتصال وإعدادات قاعدة البيانات ثم أعيدي المحاولة."}
    finally{submit.disabled=false;submit.textContent="تأكيد الطلب — الدفع عند الاستلام";}
  });
  loadProducts().then(renderCart);
})(); 
