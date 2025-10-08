// External employee script: render orders, search & status filter
// Data storage (master list)
let orders = JSON.parse(localStorage.getItem('orders')) || [];

// DOM elements (will be available after DOMContentLoaded)
let ordersGrid, noOrders, noMatches, searchName, searchPhone, searchDeliverableId, statusFilter;

function initElements() {
    ordersGrid = document.getElementById('ordersGrid');
    noOrders = document.getElementById('noOrders');
    noMatches = document.getElementById('noMatches');
    searchName = document.getElementById('searchName');
    searchPhone = document.getElementById('searchPhone');
    searchDeliverableId = document.getElementById('searchDeliverableId');
    statusFilter = document.getElementById('statusFilter');
}

// Utility: returns filtered orders based on search + status
function getFilteredOrders() {
    const nameTerm = (searchName.value || '').trim().toLowerCase();
    const phoneTerm = (searchPhone.value || '').trim().toLowerCase();
    const deliverableTerm = (searchDeliverableId.value || '').trim().toLowerCase();
    const status = statusFilter.value || 'all';

    return orders.filter(order => {
        // status filter
        if (status !== 'all' && order.status !== status) return false;

        // If any of the search fields are filled, require each filled field to match (AND semantics)
        if (nameTerm) {
            const m = (order.customerName || '').toLowerCase().includes(nameTerm);
            if (!m) return false;
        }
        if (phoneTerm) {
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
            // If the user typed a numeric id, require exact numeric match.
            if (/^\d+$/.test(deliverableTerm)) {
                if (Number(deliverableTerm) !== Number(order.id)) return false;
            } else {
                // For non-numeric input, require exact string equality with the order id string
                if (String(order.id).toLowerCase() !== deliverableTerm) return false;
            }
        }

        // All provided criteria matched
        return true;
    });
}

// Render orders (applies filters)
function renderOrders() {
    if (!ordersGrid) return;
    ordersGrid.innerHTML = '';
    noMatches.classList.add('hidden');

    if (!orders || orders.length === 0) {
        noOrders.style.display = 'block';
        return;
    }

    noOrders.style.display = 'none';

    const filtered = getFilteredOrders();
    if (filtered.length === 0) {
        noMatches.classList.remove('hidden');
        return;
    }

    filtered.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'bg-gray-50 rounded-lg p-6 border-l-4 border-blue-500 fade-in';

        let itemsList = '';
        (order.items || []).forEach(item => {
            itemsList += `<div class="flex justify-between text-sm">
                <span>${item.name} × ${item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)} دينار</span>
            </div>`;
        });

        let statusClass = 'status-new';
        if (order.status === 'قيد التحضير') statusClass = 'status-preparing';
        else if (order.status === 'تم التوصيل') statusClass = 'status-delivered';

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
                            <span class="text-green-600">${(order.total || 0).toFixed(2)} دينار</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex space-x-2 space-x-reverse">
                <button data-id="${order.id}" data-status="قيد التحضير" class="set-status btn-warning text-sm">قيد التحضير</button>
                <button data-id="${order.id}" data-status="تم التوصيل" class="set-status btn-success text-sm">تم التوصيل</button>
                <button data-id="${order.id}" class="delete-order btn-danger text-sm">حذف الطلب</button>
            </div>
        `;

        ordersGrid.appendChild(orderCard);
    });

    // Attach handlers
    ordersGrid.querySelectorAll('.set-status').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = Number(e.currentTarget.getAttribute('data-id'));
            const newStatus = e.currentTarget.getAttribute('data-status');
            updateOrderStatus(id, newStatus);
        });
    });

    ordersGrid.querySelectorAll('.delete-order').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = Number(e.currentTarget.getAttribute('data-id'));
            deleteOrder(id);
        });
    });
}

// Update order status
function updateOrderStatus(orderId, newStatus) {
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
            orders = orders.map(o => String(o.id) === String(updated.id) ? updated : o);
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        } catch (err) {
            const order = orders.find(o => o.id === orderId);
            if (order) {
                order.status = newStatus;
                localStorage.setItem('orders', JSON.stringify(orders));
                renderOrders();
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
            orders = orders.filter(o => String(o.id) !== String(orderId));
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        } catch (err) {
            orders = orders.filter(o => o.id !== orderId);
            try { localStorage.setItem('orders', JSON.stringify(orders)); } catch (e) {}
            renderOrders();
        }
    })();
}

// Auto refresh orders every 30 seconds (preserve filters)
setInterval(() => {
    orders = JSON.parse(localStorage.getItem('orders')) || [];
    renderOrders();
}, 30000);

// Fetch orders from server on load (prefer canonical server copy)
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
        console.warn('fetchOrdersFromServer failed; using local orders', err);
    }
}

// Replace localStorage with API calls
async function fetchProductsFromServer() {
  try {
    const response = await fetch(apiUrl('/api/products'));
    if (!response.ok) throw new Error('Failed to fetch products');
    products = await response.json();
    renderEmployeeProducts();
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
    renderEmployeeProducts();
  } catch (err) {
    console.error('Error adding product:', err);
  }
}

// Helper to support remote backend when frontend is hosted elsewhere (e.g. Netlify)
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    initElements();
    // wire up inputs
    if (searchName) searchName.addEventListener('input', renderOrders);
    if (searchPhone) searchPhone.addEventListener('input', renderOrders);
    if (searchDeliverableId) searchDeliverableId.addEventListener('input', renderOrders);
    if (statusFilter) statusFilter.addEventListener('change', renderOrders);
    renderOrders();
});

// Listen to storage events (fires in other tabs/windows) for immediate updates
window.addEventListener('storage', (e) => {
    if (e.key === 'orders') {
        orders = JSON.parse(e.newValue) || [];
        renderOrders();
    }
});

// BroadcastChannel fallback for same-browser immediate communication
if ('BroadcastChannel' in window) {
    const ch = new BroadcastChannel('vvv_updates');
    ch.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'orders') {
            orders = JSON.parse(localStorage.getItem('orders')) || [];
            renderOrders();
        }
    };
}

// Realtime WebSocket client for cross-device sync
let realtimeSocket;
function connectRealtime() {
    try {
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
                if (data && data.type === 'orders') {
                    orders = JSON.parse(localStorage.getItem('orders')) || [];
                    renderOrders();
                }
            } catch (e) { }
        });
        realtimeSocket.addEventListener('close', () => setTimeout(connectRealtime, 2000));
    } catch (e) {}
}
connectRealtime();
// prefer server as canonical store on load
fetchOrdersFromServer();
fetchProductsFromServer();
