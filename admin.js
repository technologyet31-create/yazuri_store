// Data storage
let products = JSON.parse(localStorage.getItem('products')) || [];
let orders = JSON.parse(localStorage.getItem('orders')) || [];

// DOM elements
const adminProductsGrid = document.getElementById('adminProductsGrid');
const noAdminProducts = document.getElementById('noAdminProducts');
const ordersGrid = document.getElementById('ordersGrid');
const noOrders = document.getElementById('noOrders');
const noMatches = document.getElementById('noMatches');
const searchName = document.getElementById('searchName');
const searchPhone = document.getElementById('searchPhone');
const searchDeliverableId = document.getElementById('searchDeliverableId');
const statusFilter = document.getElementById('statusFilter');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

// Debounce helper
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Broadcast helper to notify other tabs/windows (and same-origin pages)
function publishOrders() {
    try {
        localStorage.setItem('orders', JSON.stringify(orders));
    } catch (e) { /* ignore quota errors */ }
    if ('BroadcastChannel' in window) {
        try { new BroadcastChannel('vvv_updates').postMessage({ type: 'orders' }); } catch (e) { /* ignore */ }
    }
    try {
        if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
            // keep previous lightweight notification for older server behavior
            realtimeSocket.send(JSON.stringify({ type: 'orders' }));
        }
    } catch (e) { /* ignore */ }
}

// Try to fetch orders from server; fall back to localStorage if unreachable
async function fetchOrdersFromServer() {
    const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
    let url = apiUrl('/api/orders');
    if (token) url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    try {
        const res = await fetch(url, { headers: token ? { 'x-realtime-token': token } : {} });
        if (!res.ok) throw new Error('bad status ' + res.status);
        const remote = await res.json();
        if (Array.isArray(remote)) {
            orders = remote;
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        }
    } catch (err) {
        // network failure -> keep local orders
        console.warn('fetchOrdersFromServer failed, using local orders', err);
        orders = JSON.parse(localStorage.getItem('orders')) || orders || [];
        renderOrders();
    }
}

// Helper: resolve backend base URL
function getBackendBase() {
    const explicit = (window.BACKEND_URL || document.querySelector('meta[name="backend-url"]')?.getAttribute('content') || new URL(location.href).searchParams.get('backend') || '').trim();
    // Ignore the placeholder domain so same-origin is used on Render
    if (explicit && /(^https?:\/\/)?your-backend\.example\.com\/?$/i.test(explicit)) return '';
    return explicit ? explicit.replace(/\/$/, '') : '';
}

function apiUrl(path) {
    const base = getBackendBase();
    if (!base) return path; // same-origin
    return base.replace(/\/$/, '') + path;
}

// Apply incoming realtime messages from server to local orders and UI
function handleRealtimeMessage(data) {
    if (!data) return;
    if (data.type === 'orders:sync' && Array.isArray(data.orders)) {
        orders = data.orders;
        try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        renderOrders();
        return;
    }
    if (Array.isArray(data.orders)) {
        orders = data.orders;
        try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        renderOrders();
        return;
    }
    if (data.type === 'orders:created' && data.order) {
        const exists = orders.find(o => String(o.id) === String(data.order.id));
        if (!exists) orders.push(data.order);
        try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        renderOrders();
        return;
    }
    if (data.type === 'orders:updated' && data.order) {
        orders = orders.map(o => String(o.id) === String(data.order.id) ? data.order : o);
        try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        renderOrders();
        return;
    }
    if (data.type === 'orders:deleted' && data.order) {
        orders = orders.filter(o => String(o.id) !== String(data.order.id));
        try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
        renderOrders();
        return;
    }
}

// Realtime WebSocket (optional) - connect to local server for cross-device sync
let realtimeSocket;
function connectRealtime() {
    try {
        // allow token via global window.REALTIME_TOKEN or ?token= in the page URL
        const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
        // Build WS URL for same-origin (works on Render) or from BACKEND_URL if provided
        let wsUrl = '';
        try {
            const base = getBackendBase();
            if (base) {
                const u = new URL(base);
                const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl = wsProto + '//' + u.host + '/';
            } else {
                wsUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/';
            }
        } catch (e) {
            wsUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/';
        }
        if (token) wsUrl += (wsUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
        realtimeSocket = new WebSocket(wsUrl);
        realtimeSocket.addEventListener('open', () => console.log('realtime connected'));
        realtimeSocket.addEventListener('message', (ev) => {
            try {
                const data = JSON.parse(ev.data);
                // handle new richer message types from server
                handleRealtimeMessage(data);
            } catch (e) { }
        });
        realtimeSocket.addEventListener('close', () => setTimeout(connectRealtime, 2000));
    } catch (e) { /* ignore */ }
}

// Render admin products
function renderAdminProducts() {
    adminProductsGrid.innerHTML = '';
    
    if (products.length === 0) {
        noAdminProducts.classList.remove('hidden');
        return;
    }
    
    noAdminProducts.classList.add('hidden');
    
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'card fade-in';
        
        let mediaElement = '';
        if (product.media) {
            if (product.mediaType === 'video') {
                mediaElement = `<video class="w-full h-32 object-cover" controls>
                    <source src="${product.media}" type="video/mp4">
                    فيديو غير مدعوم
                </video>`;
            } else {
                mediaElement = `<img src="${product.media}" alt="${product.name}" class="w-full h-32 object-cover" onerror="this.src=''; this.alt='فشل تحميل الصورة'; this.style.display='none';">`;
            }
        } else {
            mediaElement = `<div class="w-full h-32 bg-gray-200 flex items-center justify-center">
                <span class="text-2xl">📦</span>
            </div>`;
        }
        
        productCard.innerHTML = `
            ${mediaElement}
            <div class="p-4">
                <h4 class="font-bold text-gray-800 mb-1">${product.name}</h4>
                <p class="text-sm text-gray-600 mb-2">${product.description || 'لا يوجد وصف'}</p>
                <p class="text-lg font-bold text-green-600 mb-3">${product.price} دينار</p>
                <div class="flex space-x-2 space-x-reverse">
                    <button onclick="editProduct(${product.id})" class="btn-primary text-sm px-3 py-1">
                        تعديل
                    </button>
                    <button onclick="deleteProduct(${product.id})" class="btn-danger text-sm px-3 py-1">
                        حذف
                    </button>
                </div>
            </div>
        `;
        adminProductsGrid.appendChild(productCard);
    });
}

// Render orders
function renderOrders() {
    ordersGrid.innerHTML = '';
    if (typeof noMatches !== 'undefined' && noMatches) noMatches.classList.add('hidden');

    if (orders.length === 0) {
        noOrders.classList.remove('hidden');
        return;
    }

    noOrders.classList.add('hidden');

    // Apply filters (AND semantics)
    const nameTerm = (searchName && searchName.value || '').trim().toLowerCase();
    const phoneTerm = (searchPhone && searchPhone.value || '').trim().toLowerCase();
    const deliverableTerm = (searchDeliverableId && searchDeliverableId.value || '').trim().toLowerCase();
    const status = (statusFilter && statusFilter.value) || 'all';

    const filtered = orders.filter(order => {
        if (status !== 'all' && order.status !== status) return false;
        if (nameTerm) {
            if (!((order.customerName || '').toLowerCase().includes(nameTerm))) return false;
        }
        if (phoneTerm) {
            // support multiple phone tokens separated by comma/space/semicolon
            const tokens = phoneTerm.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
            const normalize = s => (s || '').replace(/\D/g, '');
            const orderPhones = [normalize(order.customerPhone), normalize(order.customerPhone2)];
            const anyMatch = tokens.some(tok => {
                const n = normalize(tok);
                if (!n) return false;
                return orderPhones.some(op => op && op === n);
            });
            if (!anyMatch) return false;
        }
        if (deliverableTerm) {
            if (/^\d+$/.test(deliverableTerm)) {
                if (Number(deliverableTerm) !== Number(order.id)) return false;
            } else {
                if (String(order.id).toLowerCase() !== deliverableTerm) return false;
            }
        }
        return true;
    });

    if (filtered.length === 0) {
        if (typeof noMatches !== 'undefined' && noMatches) noMatches.classList.remove('hidden');
        return;
    }

    filtered.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'bg-gray-50 rounded-lg p-6 border-l-4 border-blue-500 fade-in';
        
        let itemsList = '';
        order.items.forEach(item => {
            itemsList += `<div class="flex justify-between text-sm">
                <span>${item.name} × ${item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)} دينار</span>
            </div>`;
        });
        
        let statusClass = 'status-new';
        if (order.status === 'قيد التحضير') {
            statusClass = 'status-preparing';
        } else if (order.status === 'تم التوصيل') {
            statusClass = 'status-delivered';
        }
        
        orderCard.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-xl font-bold text-gray-800">طلب رقم: ${order.id}</h3>
                    <p class="text-sm text-gray-600">${order.date}</p>
                </div>
                <span class="${statusClass} px-3 py-1 rounded-full text-sm font-medium">${order.status}</span>
            </div>
            
            <div class="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                    <h4 class="font-bold text-gray-700 mb-2">بيانات العميل:</h4>
                    <p><strong>الاسم:</strong> ${order.customerName}</p>
                    <p><strong>الهاتف:</strong> ${order.customerPhone}</p>
                    ${order.customerPhone2 ? `<p><strong>هاتف احتياطي:</strong> ${order.customerPhone2}</p>` : ''}
                    <p><strong>العنوان:</strong> ${order.customerAddress}</p>
                </div>
                <div>
                    <h4 class="font-bold text-gray-700 mb-2">تفاصيل الطلب:</h4>
                    <div class="space-y-1">
                        ${itemsList}
                    </div>
                    <div class="border-t pt-2 mt-2">
                        <div class="flex justify-between font-bold">
                            <span>المجموع:</span>
                            <span class="text-green-600">${order.total.toFixed(2)} دينار</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex space-x-2 space-x-reverse">
                <button onclick="updateOrderStatus(${order.id}, 'قيد التحضير')" class="btn-warning text-sm">
                    قيد التحضير
                </button>
                <button onclick="updateOrderStatus(${order.id}, 'تم التوصيل')" class="btn-success text-sm">
                    تم التوصيل
                </button>
                <button onclick="deleteOrder(${order.id})" class="btn-danger text-sm">
                    حذف الطلب
                </button>
            </div>
        `;
        ordersGrid.appendChild(orderCard);
        });
}

// Replace localStorage with API calls
async function fetchProductsFromServer() {
  try {
    const response = await fetch(apiUrl('/api/products'));
    if (!response.ok) throw new Error('Failed to fetch products');
    products = await response.json();
    renderAdminProducts();
  } catch (err) {
    console.error('Error fetching products:', err);
  }
}

async function addProductToServer(product) {
  try {
    const response = await fetch(apiUrl('/api/products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (!response.ok) throw new Error('Failed to add product');
    const newProduct = await response.json();
    products.push(newProduct);
    renderAdminProducts();
  } catch (err) {
    console.error('Error adding product:', err);
  }
}

// Add product form handler
document.getElementById('addProductForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('productName').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const description = document.getElementById('productDescription').value;
    const media = document.getElementById('productMedia').value;
    const mediaType = document.getElementById('productMediaType').value;
    
    const newProduct = {
        id: Date.now(),
        name,
        price,
        description,
        media,
        mediaType,
        dateAdded: new Date().toLocaleDateString('ar-SA')
    };
    
    addProductToServer(newProduct);
    document.getElementById('addProductForm').reset();
    alert('تم إضافة المنتج بنجاح!');
});

// Edit product
function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productMedia').value = product.media || '';
    document.getElementById('productMediaType').value = product.mediaType || 'image';
    
    deleteProduct(productId);
    alert('تم تحميل بيانات المنتج للتعديل. قم بتعديل البيانات واضغط "إضافة المنتج" لحفظ التغييرات.');
}

// Delete product
function deleteProduct(productId) {
    if (confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        products = products.filter(p => p.id !== productId);
        localStorage.setItem('products', JSON.stringify(products));
        renderAdminProducts();
    }
}

// Update order status
function updateOrderStatus(orderId, newStatus) {
    // Try to update the server first; fallback to local update
    (async () => {
        const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
        const url = '/api/orders/' + encodeURIComponent(orderId) + (token ? ('?token=' + encodeURIComponent(token)) : '');
        try {
            const res = await fetch(url, {
                method: 'PUT',
                headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-realtime-token': token } : {}),
                body: JSON.stringify({ status: newStatus })
            });
            if (!res.ok) throw new Error('bad status ' + res.status);
            const updated = await res.json();
            // server broadcasts updates; but update local view immediately
            orders = orders.map(o => String(o.id) === String(updated.id) ? updated : o);
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        } catch (err) {
            // fallback: local update + publish
            const order = orders.find(o => o.id === orderId);
            if (order) {
                order.status = newStatus;
                renderOrders();
                publishOrders();
            }
        }
    })();
}

// Delete order
function deleteOrder(orderId) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
    (async () => {
        const token = window.REALTIME_TOKEN || new URL(location.href).searchParams.get('token');
        const url = '/api/orders/' + encodeURIComponent(orderId) + (token ? ('?token=' + encodeURIComponent(token)) : '');
        try {
            const res = await fetch(url, { method: 'DELETE', headers: token ? { 'x-realtime-token': token } : {} });
            if (!res.ok) throw new Error('bad status ' + res.status);
            // server broadcasts; local view will update via WS or we can fetch fresh
            // attempt to remove locally as an immediate feedback
            orders = orders.filter(o => String(o.id) !== String(orderId));
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        } catch (err) {
            // fallback
            orders = orders.filter(o => o.id !== orderId);
            renderOrders();
            publishOrders();
        }
    })();
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // wire up live filtering
    // Debounced input handlers (200ms)
    const debouncedRender = debounce(renderOrders, 200);
    if (searchName) searchName.addEventListener('input', debouncedRender);
    if (searchPhone) searchPhone.addEventListener('input', debouncedRender);
    if (searchDeliverableId) searchDeliverableId.addEventListener('input', debouncedRender);
    if (statusFilter) statusFilter.addEventListener('change', renderOrders);

    // Clear filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (searchName) searchName.value = '';
            if (searchPhone) searchPhone.value = '';
            if (searchDeliverableId) searchDeliverableId.value = '';
            if (statusFilter) statusFilter.value = 'all';
            renderOrders();
        });
    }

    renderOrders();
    // attempt realtime connection for cross-device sync
    connectRealtime();
    // prefer server as canonical store on load
    fetchOrdersFromServer();
    fetchProductsFromServer();
});