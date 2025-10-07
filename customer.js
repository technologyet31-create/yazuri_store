// Data storage
let products = JSON.parse(localStorage.getItem('products')) || [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let orders = JSON.parse(localStorage.getItem('orders')) || [];

// DOM elements
const cartModal = document.getElementById('cartModal');
const checkoutModal = document.getElementById('checkoutModal');
const productsGrid = document.getElementById('productsGrid');
const cartItems = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const noProducts = document.getElementById('noProducts');
const cartEmpty = document.getElementById('cartEmpty');
const cartFooter = document.getElementById('cartFooter');
const fixedCart = document.getElementById('fixedCart');
const fixedCartItems = document.getElementById('fixedCartItems');
const fixedCartTotal = document.getElementById('fixedCartTotal');

// Cart modal controls
document.getElementById('closeCart').addEventListener('click', () => {
    cartModal.classList.add('hidden');
});

document.getElementById('closeCheckout').addEventListener('click', () => {
    checkoutModal.classList.add('hidden');
});

document.getElementById('viewCartBtn').addEventListener('click', () => {
    cartModal.classList.remove('hidden');
    renderCart();
});

// Render customer products
function renderCustomerProducts() {
    productsGrid.innerHTML = '';
    
    if (products.length === 0) {
        noProducts.classList.remove('hidden');
        return;
    }
    
    noProducts.classList.add('hidden');
    
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'card fade-in';
        
        let mediaElement = '';
        if (product.media) {
            if (product.mediaType === 'video') {
                mediaElement = `<video class="w-full h-48 object-cover" controls>
                    <source src="${product.media}" type="video/mp4">
                    فيديو غير مدعوم
                </video>`;
            } else {
                mediaElement = `<img src="${product.media}" alt="${product.name}" class="w-full h-48 object-cover" onerror="this.src=''; this.alt='فشل تحميل الصورة'; this.style.display='none';">`;
            }
        } else {
            mediaElement = `<div class="w-full h-48 bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center">
                <span class="text-4xl">📦</span>
            </div>`;
        }
        
        productCard.innerHTML = `
            ${mediaElement}
            <div class="p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-2">${product.name}</h3>
                <p class="text-gray-600 mb-4">${product.description || 'منتج رائع ومميز'}</p>
                <div class="flex justify-between items-center">
                    <span class="text-2xl font-bold text-green-600">${product.price} دينار</span>
                    <button onclick="addToCart(${product.id})" class="btn-primary">
                        إضافة للسلة
                    </button>
                </div>
            </div>
        `;
        productsGrid.appendChild(productCard);
    });
}

// Add to cart
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    
    const cartBtn = document.getElementById('viewCartBtn');
    if (cartBtn) {
        cartBtn.classList.add('cart-bounce');
        setTimeout(() => cartBtn.classList.remove('cart-bounce'), 300);
    }
}

// Update cart count
function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (totalItems > 0) {
        fixedCart.classList.remove('hidden');
        fixedCartItems.textContent = `${totalItems} منتج`;
        fixedCartTotal.textContent = `${totalPrice.toFixed(2)} دينار`;
    } else {
        fixedCart.classList.add('hidden');
    }
}

// Render cart
function renderCart() {
    cartItems.innerHTML = '';
    
    if (cart.length === 0) {
        cartEmpty.classList.remove('hidden');
        cartFooter.classList.add('hidden');
        return;
    }
    
    cartEmpty.classList.add('hidden');
    cartFooter.classList.remove('hidden');
    
    let total = 0;
    
    cart.forEach(item => {
        total += item.price * item.quantity;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'flex items-center justify-between p-4 border-b';
        cartItem.innerHTML = `
            <div class="flex items-center space-x-4 space-x-reverse">
                <div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                    <span class="text-2xl">📦</span>
                </div>
                <div>
                    <h4 class="font-bold">${item.name}</h4>
                    <p class="text-green-600">${item.price} دينار</p>
                </div>
            </div>
            <div class="flex items-center space-x-2 space-x-reverse">
                <button onclick="updateQuantity(${item.id}, -1)" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full hover:bg-gray-300">-</button>
                <span class="mx-2 font-bold">${item.quantity}</span>
                <button onclick="updateQuantity(${item.id}, 1)" class="bg-gray-200 text-gray-700 w-8 h-8 rounded-full hover:bg-gray-300">+</button>
                <button onclick="removeFromCart(${item.id})" class="btn-danger text-sm px-3 py-1 mr-2">حذف</button>
            </div>
        `;
        cartItems.appendChild(cartItem);
    });
    
    cartTotal.textContent = `${total.toFixed(2)} دينار`;
}

// Update quantity
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        renderCart();
        updateCartCount();
    }
}

// Remove from cart
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    renderCart();
    updateCartCount();
}

// Checkout
document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) {
        alert('سلة التسوق فارغة!');
        return;
    }
    
    cartModal.classList.add('hidden');
    checkoutModal.classList.remove('hidden');
    renderOrderSummary();
});

// Render order summary
function renderOrderSummary() {
    const orderSummary = document.getElementById('orderSummary');
    const finalTotal = document.getElementById('finalTotal');
    
    orderSummary.innerHTML = '';
    let total = 0;
    
    cart.forEach(item => {
        total += item.price * item.quantity;
        const summaryItem = document.createElement('div');
        summaryItem.className = 'flex justify-between';
        summaryItem.innerHTML = `
            <span>${item.name} × ${item.quantity}</span>
            <span>${(item.price * item.quantity).toFixed(2)} دينار</span>
        `;
        orderSummary.appendChild(summaryItem);
    });
    
    finalTotal.textContent = `${total.toFixed(2)} دينار`;
}

// Handle checkout form submission
document.getElementById('checkoutForm').addEventListener('submit', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    try {
        const customerName = document.getElementById('customerName').value.trim();
        const customerPhone = document.getElementById('customerPhone').value.trim();
        const customerPhone2 = document.getElementById('customerPhone2').value.trim();
        const customerAddress = document.getElementById('customerAddress').value.trim();
        
        if (!customerName || !customerPhone || !customerAddress) {
            alert('يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        if (cart.length === 0) {
            alert('سلة التسوق فارغة!');
            return;
        }
        
        const orderTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        const order = {
            id: Date.now(),
            customerName: customerName,
            customerPhone: customerPhone,
            customerPhone2: customerPhone2 || '',
            customerAddress: customerAddress,
            items: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            total: orderTotal,
            date: new Date().toLocaleString('ar-SA'),
            status: 'جديد'
        };
        
        orders.push(order);
        // Try to POST order to server; fallback to localStorage
        (async () => {
            const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
            const urlBase = apiUrl('/api/orders');
            const url = urlBase + (token ? ((urlBase.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)) : '');
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-realtime-token': token } : {}),
                    body: JSON.stringify(order)
                });
                if (!res.ok) throw new Error('bad status ' + res.status);
                const created = await res.json();
                // replace local placeholder with server response (if id changed)
                orders = orders.map(o => (String(o.id) === String(order.id) ? created : o));
                try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            } catch (err) {
                // fallback: keep it in localStorage and notify
                try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
                try { new BroadcastChannel('vvv_updates').postMessage({ type: 'orders' }); } catch (e) { /* ignore */ }
                try { if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) realtimeSocket.send(JSON.stringify({ type: 'orders' })); } catch (e) {}
            }
        })();
        
        cart = [];
        localStorage.setItem('cart', JSON.stringify(cart));
        
        checkoutModal.classList.add('hidden');
        
        alert(`🎉 تم تأكيد طلبك بنجاح!

رقم الطلب: ${order.id}
الاسم: ${customerName}
الهاتف: ${customerPhone}
المجموع: ${orderTotal.toFixed(2)} دينار

سيتم التواصل معك قريباً!`);
        
        this.reset();
        updateCartCount();
        renderCart();
        
    } catch (error) {
        alert('حدث خطأ أثناء معالجة الطلب: ' + error.message);
    }
});

// Auto refresh products every 30 seconds
setInterval(() => {
    products = JSON.parse(localStorage.getItem('products')) || [];
    renderCustomerProducts();
}, 30000);

// Fetch latest orders from server on load (to sync employee/admin across devices)
async function fetchOrdersFromServer() {
    const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
    let url = '/api/orders';
    if (token) url += '?token=' + encodeURIComponent(token);
    try {
        const res = await fetch(url, { headers: token ? { 'x-realtime-token': token } : {} });
        if (!res.ok) throw new Error('bad status ' + res.status);
        const remote = await res.json();
        if (Array.isArray(remote)) {
            orders = remote;
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        }
    } catch (err) {
        console.warn('fetchOrdersFromServer failed; using local orders', err);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    renderCustomerProducts();
    updateCartCount();
});

// Realtime WebSocket support to receive cross-device updates
let realtimeSocket;
function connectRealtime() {
    try {
    const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
    let url = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + (location.hostname || 'localhost') + ':3000';
    if (token) url += '?token=' + encodeURIComponent(token);
        realtimeSocket = new WebSocket(url);
        realtimeSocket.addEventListener('open', () => console.log('realtime connected'));
        realtimeSocket.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data && data.type === 'orders') {
                    orders = JSON.parse(localStorage.getItem('orders')) || [];
                }
            } catch (e) { }
        });
        realtimeSocket.addEventListener('close', () => setTimeout(connectRealtime, 2000));
    } catch (e) {}
}
connectRealtime();
// prefer server as canonical store on load
fetchOrdersFromServer();