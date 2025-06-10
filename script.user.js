// ==UserScript==
// @name         银河奶牛-自动计算购买材料
// @name:zh-CN   银河奶牛-自动计算购买材料
// @name:en      MWI-AutoBuyer
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  自动计算需要的材料数量，一键购买缺少的材料(Automatically calculate the required material quantities and purchase missing materials with one click.)
// @description:en  Automatically calculate the required material quantities and purchase missing materials with one click.
// @author       XIxixi297
// @license      CC-BY-NC-SA-4.0
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=milkywayidle.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let scriptInjected = false;

    const AUTO_BUY_SCRIPT = `
(function () {
    'use strict';

    // 配置和语言
    const LANG = (navigator.language || 'en').toLowerCase().includes('zh') ? {
        autoBuyButton: '🛒 自动购买',
        autoBuyButtonActive: '⏳ 购买中...',
        missingPrefix: '缺:',
        noMaterialsNeeded: '材料充足！',
        startPurchasing: '开始购买',
        purchased: '已购买',
        purchaseFailed: '购买失败',
        purchaseComplete: '购买完成！',
        purchaseError: '购买出错，请检查控制台',
        wsNotAvailable: 'WebSocket日志查看器未可用，请确保已启用',
        waitingForLogger: '等待WebSocket日志查看器...',
        loggerReady: 'WebSocket日志查看器已就绪！',
        requestFailed: '请求失败',
        requestTimeout: '请求超时',
        allPurchasesFailed: '所有购买都失败了，请检查控制台',
        purchaseSuccess: '成功购买',
        materials: '种材料',
        totalCost: '共花费',
        coins: '金币',
        each: '个'
    } : {
        autoBuyButton: '🛒 Auto Buy',
        autoBuyButtonActive: '⏳ Buying...',
        missingPrefix: 'Need:',
        noMaterialsNeeded: 'All materials sufficient!',
        startPurchasing: 'Start purchasing',
        purchased: 'Purchased',
        purchaseFailed: 'Purchase failed',
        purchaseComplete: 'Purchase completed!',
        purchaseError: 'Purchase error, check console',
        wsNotAvailable: 'WebSocket logger not available, ensure it is enabled',
        waitingForLogger: 'Waiting for WebSocket logger...',
        loggerReady: 'WebSocket logger ready!',
        requestFailed: 'Request failed',
        requestTimeout: 'Request timeout',
        allPurchasesFailed: 'All purchases failed, check console',
        purchaseSuccess: 'Successfully purchased',
        materials: 'materials',
        totalCost: 'total cost',
        coins: 'coins',
        each: ''
    };

    const SELECTORS = {
        production: {
            container: '.SkillActionDetail_regularComponent__3oCgr',
            input: '.Input_input__2-t98',
            requirements: '.SkillActionDetail_itemRequirements__3SPnA',
            nameDiv: '.SkillActionDetail_name__3erHV',
            inventoryCount: '.SkillActionDetail_inventoryCount__tHmPD',
            inputCount: '.SkillActionDetail_inputCount__1rdrn'
        },
        house: {
            container: '.HousePanel_modalContent__3AwPH',
            requirements: '.HousePanel_itemRequirements__1qFjZ',
            headerDiv: '.HousePanel_header__3QdpP',
            inventoryCount: '.HousePanel_inventoryCount__YxePN',
            inputCount: '.HousePanel_inputCount__26GPq'
        }
    };

    // 工具函数
    function getCountById(id) {
        const targetId = \`/items/\${id}\`;
        const container = document.querySelector('.Inventory_inventory__17CH2');
        if (!container?.lastChild) return 0;

        const items = container.lastChild.querySelectorAll(".Item_item__2De2O.Item_clickable__3viV6");
        for (let item of items) {
            try {
                const reactKey = Object.keys(item).find(key => key.startsWith('__reactProps'));
                if (!reactKey) continue;

                const itemHrid = item[reactKey].children[0][1]._owner.memoizedProps.itemHrid;
                if (itemHrid === targetId) {
                    return item[reactKey].children[0][1]._owner.memoizedProps.count;
                }
            } catch (e) {
                continue;
            }
        }
        return 0;
    }

    function parseNumber(text) {
        if (!text) return 0;
        const match = text.match(/^([\\d,]+(?:\\.\\d+)?)\\s*([KMB])\$/i);
        if (!match) return parseInt(text.replace(/[^\\d]/g, ''), 10) || 0;

        let num = parseFloat(match[1].replace(/,/g, ''));
        const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
        return Math.floor(num * (multipliers[match[2].toUpperCase()] || 1));
    }

    function extractItemId(svgElement) {
        const useElement = svgElement?.querySelector('use');
        const href = useElement?.getAttribute('href');
        const match = href?.match(/#(.+)\$/);
        return match ? match[1] : null;
    }

    // PostMessage API
    class PostMessageAPI {
        constructor() {
            this.pendingRequests = new Map();
            this.requestIdCounter = 1;
            this.setupMessageListener();
        }

        setupMessageListener() {
            window.addEventListener('message', (event) => {
                if (event.origin !== window.location.origin) return;
                const message = event.data;

                if (message.type === 'ws_response') {
                    const pendingRequest = this.pendingRequests.get(message.requestId);
                    if (pendingRequest) {
                        this.pendingRequests.delete(message.requestId);
                        clearTimeout(pendingRequest.timeout);
                        pendingRequest[message.success ? 'resolve' : 'reject'](
                            message.success ? message.data : new Error(message.error || LANG.requestFailed)
                        );
                    }
                } else if (message.type === 'ws_ready') {
                    this.checkAPI();
                }
            });
        }

        async sendRequest(action, data = {}, timeout = 30000) {
            const requestId = \`req_\${this.requestIdCounter++}_\${Date.now()}\`;

            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(\`\${LANG.requestTimeout}: \${action}\`));
                }, timeout);

                this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutId });

                window.postMessage({
                    type: 'ws_request',
                    action,
                    data,
                    requestId
                }, window.location.origin);
            });
        }

        async checkAPI() {
            try {
                return await this.sendRequest('check_api', {}, 5000);
            } catch {
                return { available: false };
            }
        }

        async batchPurchase(items, delayBetween = 800) {
            return await this.sendRequest('batch_purchase', { items, delayBetween });
        }
    }

    // 通知系统
    class Toast {
        constructor() {
            this.container = document.createElement('div');
            Object.assign(this.container.style, {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: '10000',
                pointerEvents: 'none'
            });
            document.body.appendChild(this.container);
        }

        show(message, type = 'info', duration = 3000) {
            const toast = document.createElement('div');
            toast.textContent = message;

            const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#F44336' };
            Object.assign(toast.style, {
                background: colors[type],
                color: 'white',
                padding: '12px 24px',
                borderRadius: '6px',
                marginBottom: '10px',
                fontSize: '14px',
                fontWeight: '500',
                opacity: '0',
                transform: 'translateY(-20px)',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            });

            this.container.appendChild(toast);

            setTimeout(() => Object.assign(toast.style, { opacity: '1', transform: 'translateY(0)' }), 10);
            setTimeout(() => {
                Object.assign(toast.style, { opacity: '0', transform: 'translateY(-20px)' });
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    // 材料计算器
    class MaterialCalculator {
        static async calculateRequirements(type) {
            const selectors = SELECTORS[type];
            const container = document.querySelector(selectors.container);
            if (!container) return [];

            const requirements = [];
            let productionQuantity = 1;

            if (type === 'production') {
                const input = document.querySelector(selectors.input);
                productionQuantity = parseInt(input?.value) || 0;
            }

            const requirementsContainer = container.querySelector(selectors.requirements);
            if (!requirementsContainer) return [];

            const materialContainers = requirementsContainer.querySelectorAll('.Item_itemContainer__x7kH1');
            const inventoryCounts = requirementsContainer.querySelectorAll(selectors.inventoryCount);
            const inputCounts = requirementsContainer.querySelectorAll(selectors.inputCount);

            for (let i = 0; i < materialContainers.length; i++) {
                const nameElement = materialContainers[i].querySelector('.Item_name__2C42x');
                const svgElement = materialContainers[i].querySelector('svg[aria-label]');

                if (!nameElement || !svgElement) continue;

                const materialName = nameElement.textContent.trim();
                const itemId = extractItemId(svgElement);
                const currentStock = getCountById(itemId);

                let totalNeeded = 0;
                if (type === 'production') {
                    const consumptionMatch = inputCounts[i]?.textContent.match(/\\d+\\.?\\d*/);
                    const consumptionPerUnit = consumptionMatch ? parseFloat(consumptionMatch[0]) : 0;
                    totalNeeded = Math.ceil(productionQuantity * consumptionPerUnit);
                } else {
                    const neededMatch = inputCounts[i]?.textContent.match(/\\/\\s*([\\d,]+(?:\\.\\d+)?[KMB]?)\\s*/);
                    if (neededMatch) {
                        totalNeeded = parseNumber(neededMatch[1]);
                    }
                }

                const supplementNeeded = Math.max(0, totalNeeded - currentStock);

                requirements.push({
                    materialName,
                    itemId,
                    supplementNeeded,
                    totalNeeded,
                    currentStock,
                    index: i
                });
            }

            return requirements;
        }
    }

    // UI管理器
    class UIManager {
        constructor() {
            this.toast = new Toast();
            this.postMessageAPI = new PostMessageAPI();
            this.observer = null;
            this.loggerReady = false;
            this.checkLoggerAndInit();
        }

        async checkLoggerAndInit() {
            const checkAPI = async () => {
                try {
                    const result = await this.postMessageAPI.checkAPI();
                    if (result.available && result.ws_ready) {
                        this.loggerReady = true;
                        console.log(\`%c[MWI-AutoBuyer] \${LANG.loggerReady}\`, 'color: #4CAF50; font-weight: bold;');
                        this.initObserver();
                        return true;
                    }
                    return result.available ? false : false;
                } catch {
                    return false;
                }
            };

            if (!(await checkAPI())) {
                console.log(\`[MWI-AutoBuyer] \${LANG.waitingForLogger}\`);
                const pollAPI = async () => {
                    if (await checkAPI()) return;
                    setTimeout(pollAPI, 2000);
                };
                setTimeout(pollAPI, 3000);
            }
        }

        createButton(onClick) {
            const btn = document.createElement("button");
            btn.textContent = LANG.autoBuyButton;

            Object.assign(btn.style, {
                padding: '0 10px',
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text-dark-mode)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                fontFamily: '"Roboto"',
                textAlign: 'center',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '36px',
                lineHeight: '15px',
                minWidth: 'auto',
                overflow: 'hidden'
            });

            ['mouseenter', 'mouseleave'].forEach((event, index) => {
                btn.addEventListener(event, () => {
                    btn.style.backgroundColor = index ? 'var(--color-primary)' : 'var(--color-primary-hover)';
                });
            });

            btn.addEventListener("click", async () => {
                if (!this.loggerReady) {
                    console.error(LANG.wsNotAvailable);
                    return;
                }

                btn.disabled = true;
                btn.textContent = LANG.autoBuyButtonActive;
                Object.assign(btn.style, {
                    backgroundColor: "var(--color-disabled)",
                    cursor: "not-allowed"
                });

                try {
                    await onClick();
                } catch (error) {
                    this.toast.show(\`\${LANG.purchaseError}: \${error.message}\`, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = LANG.autoBuyButton;
                    Object.assign(btn.style, {
                        backgroundColor: "var(--color-primary)",
                        cursor: "pointer"
                    });
                }
            });

            return btn;
        }

        createInfoSpan() {
            const span = document.createElement("span");
            span.textContent = \`\${LANG.missingPrefix}0\`;
            Object.assign(span.style, {
                fontSize: '12px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                minWidth: '60px',
                textAlign: 'center'
            });
            return span;
        }

        async updateInfoSpans(type) {
            const requirements = await MaterialCalculator.calculateRequirements(type);
            const className = type === 'production' ? 'material-info-span' : 'house-material-info-span';
            const spans = document.querySelectorAll(\`.\${className}\`);

            spans.forEach((span, index) => {
                if (requirements[index]) {
                    const needed = requirements[index].supplementNeeded;
                    span.textContent = \`\${LANG.missingPrefix}\${needed}\`;
                    span.style.color = needed > 0 ? '#ff6b6b' : 'var(--color-text-dark-mode)';
                }
            });
        }

        async purchaseFlow(type) {
            if (!this.loggerReady) {
                this.toast.show(LANG.wsNotAvailable, 'error');
                return;
            }

            const requirements = await MaterialCalculator.calculateRequirements(type);
            const needToBuy = requirements.filter(item =>
                item.itemId !== 'coin' &&
                item.itemId !== '/items/coin' &&
                item.supplementNeeded > 0 &&
                item.itemId
            );

            if (needToBuy.length === 0) {
                this.toast.show(LANG.noMaterialsNeeded, 'info');
                return;
            }

            const itemList = needToBuy.map(item =>
                \`\${item.materialName}: \${item.supplementNeeded}\${LANG.each}\`
            ).join(', ');

            this.toast.show(\`\${LANG.startPurchasing} \${needToBuy.length} \${LANG.materials}: \${itemList}\`, 'info');

            try {
                const purchaseItems = needToBuy.map(item => ({
                    itemHrid: item.itemId,
                    quantity: item.supplementNeeded,
                    materialName: item.materialName
                }));

                const results = await this.postMessageAPI.batchPurchase(purchaseItems, 800);

                let successCount = 0;
                let totalCost = 0;

                results.forEach(result => {
                    if (result.success) {
                        successCount++;
                        const cost = result.priceAnalysis?.totalCost || 0;
                        totalCost += cost;

                        this.toast.show(
                            \`\${LANG.purchased} \${result.item.materialName || result.item.itemHrid} x\${result.item.quantity} (\${cost}\${LANG.coins})\`,
                            'success'
                        );
                    } else {
                        this.toast.show(
                            \`\${LANG.purchaseFailed} \${result.item.materialName || result.item.itemHrid}: \${result.error}\`,
                            'error'
                        );
                    }
                });

                if (successCount > 0) {
                    this.toast.show(
                        \`\${LANG.purchaseComplete} \${LANG.purchaseSuccess} \${successCount}/\${needToBuy.length} \${LANG.materials}，\${LANG.totalCost} \${totalCost} \${LANG.coins}\`,
                        'success',
                        5000
                    );
                    setTimeout(() => this.updateInfoSpans(type), 2000);
                } else {
                    this.toast.show(LANG.allPurchasesFailed, 'error');
                }

            } catch (error) {
                this.toast.show(\`\${LANG.purchaseError}: \${error.message}\`, 'error');
            }
        }

        initObserver() {
            if (this.observer) return;

            this.observer = new MutationObserver(() => {
                this.setupUI('production');
                this.setupUI('house');
            });

            this.observer.observe(document.body, { childList: true, subtree: true });

            document.addEventListener('input', (e) => {
                if (e.target.classList.contains('Input_input__2-t98')) {
                    setTimeout(() => this.updateInfoSpans('production'), 100);
                }
            });

            this.setupUI('production');
            this.setupUI('house');
        }

        setupUI(type) {
            const config = {
                production: {
                    className: 'material-info-span',
                    gridCols: 'auto min-content auto auto',
                    buttonParent: 'nameDiv',
                    buttonStyle: { marginLeft: '10px' }
                },
                house: {
                    className: 'house-material-info-span',
                    gridCols: 'auto auto auto 120px',
                    buttonParent: 'headerDiv',
                    buttonStyle: { marginBottom: '10px', display: 'block', width: 'fit-content' }
                }
            };

            const selectors = SELECTORS[type];
            const conf = config[type];

            document.querySelectorAll(selectors.container).forEach(panel => {
                const dataAttr = type === 'production' ? 'buttonInserted' : 'autoBuyButtonInserted';
                const modifiedAttr = type === 'production' ? 'modified' : 'houseModified';

                if (panel.dataset[dataAttr]) return;

                const requirements = panel.querySelector(selectors.requirements);
                if (!requirements) return;

                panel.dataset[dataAttr] = "true";

                if (!requirements.dataset[modifiedAttr]) {
                    requirements.dataset[modifiedAttr] = "true";
                    requirements.style.gridTemplateColumns = conf.gridCols;

                    requirements.querySelectorAll('.Item_itemContainer__x7kH1').forEach(item => {
                        if (item.nextSibling?.classList?.contains(conf.className)) return;
                        const span = this.createInfoSpan();
                        span.className = conf.className;
                        item.parentNode.insertBefore(span, item.nextSibling);
                    });

                    setTimeout(() => this.updateInfoSpans(type), 100);
                }

                const parentDiv = panel.querySelector(selectors[conf.buttonParent]);
                if (parentDiv && !parentDiv.parentNode.querySelector('button[textContent*="🛒"]')) {
                    const btn = this.createButton(() => this.purchaseFlow(type));
                    Object.assign(btn.style, conf.buttonStyle);

                    if (type === 'production') {
                        parentDiv.parentNode.insertBefore(btn, parentDiv.nextSibling);
                    } else {
                        parentDiv.parentNode.insertBefore(btn, parentDiv);
                    }
                }
            });
        }
    }

    new UIManager();
})();
    `;

    // WebSocket 拦截和 API 设置
    function setupWebSocketAndAPI() {
        window.wsInstances = [];
        window.currentWS = null;
        window.wsMessageListeners = new Set();
        window.wsRequestHandlers = new Map();
        window.wsPurchaseQueue = [];
        window.wsMarketDataCache = new Map();

        // PostMessage 处理器
        window.addEventListener('message', async (event) => {
            if (event.origin !== window.location.origin || event.data?.type !== 'ws_request') return;

            const { action, data, requestId } = event.data;

            try {
                let result;
                switch (action) {
                    case 'check_api':
                        result = { available: true, ws_ready: !!window.currentWS };
                        break;
                    case 'get_market_data':
                        result = await handleGetMarketData(data);
                        break;
                    case 'smart_purchase':
                        result = await handleSmartPurchase(data);
                        break;
                    case 'batch_purchase':
                        result = await handleBatchPurchase(data);
                        break;
                    default:
                        throw new Error(`未知的操作: ${action}`);
                }

                window.postMessage({
                    type: 'ws_response',
                    action,
                    success: true,
                    data: result,
                    requestId
                }, window.location.origin);

            } catch (error) {
                window.postMessage({
                    type: 'ws_response',
                    action,
                    success: false,
                    error: error.message,
                    requestId
                }, window.location.origin);
            }
        });

        // 市场数据处理
        async function handleGetMarketData({ itemHrid, useCache = true }) {
            const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

            if (useCache && window.wsMarketDataCache.has(fullItemHrid)) {
                const cached = window.wsMarketDataCache.get(fullItemHrid);
                if (Date.now() - cached.timestamp < 60000) {
                    return cached.data;
                }
            }

            return new Promise((resolve, reject) => {
                if (!window.currentWS || window.currentWS.readyState !== WebSocket.OPEN) {
                    reject(new Error('WebSocket连接不可用'));
                    return;
                }

                const timeout = setTimeout(() => reject(new Error('获取市场数据超时')), 8000);

                const responseHandler = (responseData) => {
                    if (responseData.type === 'market_item_order_books_updated' &&
                        responseData.marketItemOrderBooks?.itemHrid === fullItemHrid) {
                        clearTimeout(timeout);
                        cleanup();
                        resolve(responseData.marketItemOrderBooks);
                    }
                };

                const cleanup = () => {
                    const handlers = window.wsRequestHandlers.get('market_item_order_books_updated');
                    if (handlers) {
                        handlers.delete(responseHandler);
                        if (handlers.size === 0) {
                            window.wsRequestHandlers.delete('market_item_order_books_updated');
                        }
                    }
                };

                if (!window.wsRequestHandlers.has('market_item_order_books_updated')) {
                    window.wsRequestHandlers.set('market_item_order_books_updated', new Set());
                }
                window.wsRequestHandlers.get('market_item_order_books_updated').add(responseHandler);

                window.currentWS.send(JSON.stringify({
                    type: "get_market_item_order_books",
                    getMarketItemOrderBooksData: { itemHrid: fullItemHrid }
                }));
            });
        }

        // 智能购买处理
        async function handleSmartPurchase({ itemHrid, quantity }) {
            const marketData = await handleGetMarketData({ itemHrid });
            const priceAnalysis = analyzeMarketPrice(marketData, quantity);
            const result = await executePurchase(itemHrid, quantity, priceAnalysis.maxPrice);
            return { success: true, result, priceAnalysis };
        }

        // 批量购买处理
        async function handleBatchPurchase({ items, delayBetween = 800 }) {
            const results = [];
            for (let i = 0; i < items.length; i++) {
                try {
                    const result = await handleSmartPurchase(items[i]);
                    results.push({ item: items[i], ...result });
                } catch (error) {
                    results.push({ item: items[i], success: false, error: error.message });
                }
                if (i < items.length - 1 && delayBetween > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBetween));
                }
            }
            return results;
        }

        // 执行购买
        async function executePurchase(itemHrid, quantity, price, enhancementLevel = 0) {
            const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

            return new Promise((resolve, reject) => {
                if (!window.currentWS || window.currentWS.readyState !== WebSocket.OPEN) {
                    reject(new Error('WebSocket连接不可用'));
                    return;
                }

                const timeout = setTimeout(() => reject(new Error('购买超时')), 15000);

                window.currentWS.send(JSON.stringify({
                    type: "post_market_order",
                    postMarketOrderData: {
                        isSell: false,
                        itemHrid: fullItemHrid,
                        enhancementLevel,
                        quantity,
                        price,
                        isInstantOrder: true
                    }
                }));

                const checkResult = () => {
                    const recent = window.wsPurchaseQueue.filter(item => Date.now() - item.timestamp < 15000);
                    const completed = recent.find(item => item.type === 'purchase_completed');
                    const error = recent.find(item => item.type === 'error');

                    if (completed) {
                        clearTimeout(timeout);
                        resolve(completed.data);
                    } else if (error) {
                        clearTimeout(timeout);
                        reject(new Error(error.data.message || '购买失败'));
                    } else {
                        setTimeout(checkResult, 200);
                    }
                };

                checkResult();
            });
        }

        // 市场价格分析
        function analyzeMarketPrice(marketData, neededQuantity) {
            const asks = marketData.orderBooks?.[0]?.asks;
            if (!asks?.length) throw new Error('没有可用的卖单');

            let cumulativeQuantity = 0;
            let targetPrice = 0;
            let totalCost = 0;
            let priceBreakdown = [];

            for (const ask of asks) {
                const availableFromThisOrder = Math.min(ask.quantity, neededQuantity - cumulativeQuantity);
                cumulativeQuantity += availableFromThisOrder;
                targetPrice = ask.price;
                totalCost += availableFromThisOrder * ask.price;
                priceBreakdown.push({
                    price: ask.price,
                    quantity: availableFromThisOrder,
                    cost: availableFromThisOrder * ask.price
                });

                if (cumulativeQuantity >= neededQuantity) break;
            }

            if (cumulativeQuantity < neededQuantity) {
                throw new Error(`市场库存不足。可用: ${cumulativeQuantity}, 需要: ${neededQuantity}`);
            }

            return {
                maxPrice: targetPrice,
                averagePrice: Math.ceil(totalCost / neededQuantity),
                totalCost,
                availableQuantity: cumulativeQuantity,
                priceBreakdown
            };
        }

        // 消息分发
        function dispatchMessage(data, direction) {
            window.wsMessageListeners.forEach(listener => {
                try { listener(data, direction); } catch (e) { }
            });

            if (data.type && window.wsRequestHandlers.has(data.type)) {
                window.wsRequestHandlers.get(data.type).forEach(handler => {
                    try { handler(data); } catch (e) { }
                });
            }

            // 缓存和队列处理
            if (data.type === 'market_item_order_books_updated') {
                const itemHrid = data.marketItemOrderBooks?.itemHrid;
                if (itemHrid) {
                    window.wsMarketDataCache.set(itemHrid, { data: data.marketItemOrderBooks, timestamp: Date.now() });
                    setTimeout(() => {
                        const cached = window.wsMarketDataCache.get(itemHrid);
                        if (cached && Date.now() - cached.timestamp > 300000) {
                            window.wsMarketDataCache.delete(itemHrid);
                        }
                    }, 300000);
                }
            }

            if (data.type === 'info' && data.message === 'infoNotification.buyOrderCompleted') {
                window.wsPurchaseQueue.push({ type: 'purchase_completed', data, timestamp: Date.now() });
            }

            if (data.type === 'error') {
                window.wsPurchaseQueue.push({ type: 'error', data, timestamp: Date.now() });
            }
        }

        // WebSocket 拦截
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = new Proxy(OriginalWebSocket, {
            construct(target, args) {
                const ws = new target(...args);
                window.wsInstances.push(ws);
                window.currentWS = ws;

                const originalSend = ws.send;
                ws.send = function (data) {
                    try {
                        dispatchMessage(JSON.parse(data), 'send');
                    } catch (e) { }
                    return originalSend.call(this, data);
                };

                ws.addEventListener("message", (event) => {
                    try {
                        dispatchMessage(JSON.parse(event.data), 'receive');
                    } catch (e) { }
                });

                ws.addEventListener("open", () => {
                    if (window.wsInstances.length === 1 && !scriptInjected) {
                        setTimeout(async () => {
                            try {
                                await injectLocalScript();
                                console.info('%c[MWI-AutoBuyer] 界面注入成功', 'color: #4CAF50; font-weight: bold;');
                            } catch (error) {
                                console.error('%c[MWI-AutoBuyer] 界面注入失败:', 'color: #F44336; font-weight: bold;', error);
                            }
                        }, 1000);
                    }

                    window.postMessage({ type: 'ws_ready', detail: { ws, url: args[0] } }, window.location.origin);
                });

                ws.addEventListener("close", () => {
                    const index = window.wsInstances.indexOf(ws);
                    if (index > -1) window.wsInstances.splice(index, 1);
                    if (window.currentWS === ws) {
                        window.currentWS = window.wsInstances[window.wsInstances.length - 1] || null;
                    }
                });

                return ws;
            }
        });

        window.clearWSCache = () => {
            window.wsMarketDataCache.clear();
            window.wsPurchaseQueue.length = 0;
            return true;
        };
    }

    // 注入脚本
    function injectLocalScript() {
        if (scriptInjected) return Promise.resolve();

        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.textContent = AUTO_BUY_SCRIPT;
                (document.head || document.documentElement).appendChild(script);
                scriptInjected = true;
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    // 初始化
    setupWebSocketAndAPI();
})();