// ==UserScript==
// @name         [银河奶牛]自动计算购买材料
// @name:zh-CN   [银河奶牛]自动计算购买材料
// @name:en      MWI-AutoBuyer
// @namespace    http://tampermonkey.net/
// @version      2.2.2
// @description  自动计算制造、烹饪、强化、房屋等所需材料，一键购买缺少的材料(Automatically calculate the required material quantities and purchase needed materials with one click.)
// @description:en  Automatically calculate the required material quantities and purchase needed materials with one click.
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
    let mooketMode = false; // 标记是否使用Mooket接口模式

    const AUTO_BUY_SCRIPT = `
    (function () {
        'use strict';

        // 语言配置
        const LANG = (navigator.language || 'en').toLowerCase().includes('zh') ? {
            directBuyButton: '直接购买（左一）', bidOrderButton: '求购订单（右一）',
            directBuyButtonActive: '⏳ 购买中...', bidOrderButtonActive: '📋 提交中...',
            missingPrefix: '缺:', noMaterialsNeeded: '材料充足！',
            startDirectPurchasing: '开始直接购买', startBidOrdering: '开始提交求购订单',
            purchased: '已购买', orderSubmitted: '订单已提交', purchaseFailed: '购买失败', orderFailed: '订单提交失败',
            purchaseComplete: '购买完成！', orderComplete: '订单提交完成！', purchaseError: '购买出错，请检查控制台',
            wsNotAvailable: 'WebSocket日志查看器未可用，请确保已启用', waitingForLogger: '等待WebSocket日志查看器...',
            loggerReady: 'WebSocket日志查看器已就绪！', requestFailed: '请求失败', requestTimeout: '请求超时',
            allPurchasesFailed: '所有购买都失败了，请检查控制台', allOrdersFailed: '所有订单都失败了，请检查控制台',
            purchaseSuccess: '成功购买', orderSuccess: '成功提交', materials: '种材料', each: '个'
        } : {
            directBuyButton: 'Buy from WTS', bidOrderButton: 'New Buy Listing',
            directBuyButtonActive: '⏳ Buying...', bidOrderButtonActive: '📋 Submitting...',
            missingPrefix: 'Need:', noMaterialsNeeded: 'All materials sufficient!',
            startDirectPurchasing: 'Start direct purchasing', startBidOrdering: 'Start submitting bid orders',
            purchased: 'Purchased', orderSubmitted: 'Order submitted', purchaseFailed: 'Purchase failed', orderFailed: 'Order submit failed',
            purchaseComplete: 'Purchase completed!', orderComplete: 'Orders submitted!', purchaseError: 'Purchase error, check console',
            wsNotAvailable: 'WebSocket logger not available, ensure it is enabled', waitingForLogger: 'Waiting for WebSocket logger...',
            loggerReady: 'WebSocket logger ready!', requestFailed: 'Request failed', requestTimeout: 'Request timeout',
            allPurchasesFailed: 'All purchases failed, check console', allOrdersFailed: 'All orders failed, check console',
            purchaseSuccess: 'Successfully purchased', orderSuccess: 'Successfully submitted', materials: 'materials', each: ''
        };

        const SELECTORS = {
            production: {
                container: '.SkillActionDetail_regularComponent__3oCgr',
                input: '.SkillActionDetail_maxActionCountInput__1C0Pw .Input_input__2-t98',
                requirements: '.SkillActionDetail_itemRequirements__3SPnA',
                upgradeSelector: '.SkillActionDetail_upgradeItemSelectorInput__2mnS0',
                nameDiv: '.SkillActionDetail_name__3erHV',
                inputCount: '.SkillActionDetail_inputCount__1rdrn'
            },
            house: {
                container: '.HousePanel_modalContent__3AwPH',
                requirements: '.HousePanel_itemRequirements__1qFjZ',
                headerDiv: '.HousePanel_header__3QdpP',
                inputCount: '.HousePanel_inputCount__26GPq'
            },
            enhancing: {
                container: '.SkillActionDetail_enhancingComponent__17bOx',
                input: '.SkillActionDetail_maxActionCountInput__1C0Pw .Input_input__2-t98',
                requirements: '.SkillActionDetail_itemRequirements__3SPnA',
                inputCount: '.SkillActionDetail_inputCount__1rdrn',
                instructions: '.SkillActionDetail_instructions___EYV5',
                cost: '.SkillActionDetail_costs__3Q6Bk'
            }
        };

        // 工具函数
        const utils = {
            getCountById(id) {
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
                    } catch { continue; }
                }
                return 0;
            },

            extractItemId(svgElement) {
                const href = svgElement?.querySelector('use')?.getAttribute('href');
                return href?.match(/#(.+)$/)?.[1] || null;
            },

            applyStyles(element, styles) {
                Object.assign(element.style, styles);
            }
        };

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
                    const { type, requestId, success, data, error } = event.data;

                    if (type === 'ws_response') {
                        const request = this.pendingRequests.get(requestId);
                        if (request) {
                            this.pendingRequests.delete(requestId);
                            clearTimeout(request.timeout);
                            request[success ? 'resolve' : 'reject'](success ? data : new Error(error || LANG.requestFailed));
                        }
                    } else if (type === 'ws_ready') {
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
                    window.postMessage({ type: 'ws_request', action, data, requestId }, window.location.origin);
                });
            }

            async checkAPI() {
                try {
                    return await this.sendRequest('check_api', {}, 5000);
                } catch {
                    return { available: false };
                }
            }

            async batchDirectPurchase(items, delayBetween = 800) {
                return await this.sendRequest('batch_direct_purchase', { items, delayBetween });
            }

            async batchBidOrder(items, delayBetween = 800) {
                return await this.sendRequest('batch_bid_order', { items, delayBetween });
            }
        }

        // 通知系统
        class Toast {
            constructor() {
                this.container = document.createElement('div');
                utils.applyStyles(this.container, {
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: '10000', pointerEvents: 'none'
                });
                document.body.appendChild(this.container);
            }

            show(message, type = 'info', duration = 3000) {
                const toast = document.createElement('div');
                toast.textContent = message;
                const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#F44336' };

                utils.applyStyles(toast, {
                    background: colors[type], color: 'white', padding: '12px 24px', borderRadius: '6px',
                    marginBottom: '10px', fontSize: '14px', fontWeight: '500', opacity: '0',
                    transform: 'translateY(-20px)', transition: 'all 0.3s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                });

                this.container.appendChild(toast);
                setTimeout(() => utils.applyStyles(toast, { opacity: '1', transform: 'translateY(0)' }), 10);
                setTimeout(() => {
                    utils.applyStyles(toast, { opacity: '0', transform: 'translateY(-20px)' });
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
                let executionCount = 0;

                // 获取执行次数
                if (type !== 'house') {
                    const actionInput = container.querySelector(selectors.input);
                    executionCount = parseInt(actionInput?.value) || 0;
                }

                // 计算普通材料需求
                const requirementsContainer = container.querySelector(selectors.requirements);
                if (requirementsContainer) {
                    const materialContainers = requirementsContainer.querySelectorAll('.Item_itemContainer__x7kH1');
                    const inputCounts = requirementsContainer.querySelectorAll(selectors.inputCount);

                    for (let i = 0; i < materialContainers.length; i++) {
                        const nameElement = materialContainers[i].querySelector('.Item_name__2C42x');
                        const svgElement = materialContainers[i].querySelector('svg[aria-label]');
                        if (!nameElement || !svgElement) continue;

                        const materialName = nameElement.textContent.trim();
                        const itemId = utils.extractItemId(svgElement);
                        const currentStock = utils.getCountById(itemId);
                        const consumptionMatch = inputCounts[i]?.textContent.match(/\\/\\s*([\\d,.]+)\\s*/);
                        const consumptionPerUnit = consumptionMatch ? parseFloat(consumptionMatch[1].replace(/,/g, '')) : 0;

                        const totalNeeded = type === 'house' ? consumptionPerUnit : Math.ceil(executionCount * consumptionPerUnit);
                        const supplementNeeded = Math.max(0, totalNeeded - currentStock);

                        requirements.push({
                            materialName, itemId, supplementNeeded, totalNeeded, currentStock, index: i, type: 'material'
                        });
                    }
                }

                // 计算升级物品需求（仅production类型）
                if (type === 'production') {
                    const upgradeContainer = container.querySelector(selectors.upgradeSelector);
                    if (upgradeContainer) {
                        const upgradeItem = upgradeContainer.querySelector('.Item_item__2De2O');
                        let materialName = '', itemId = null, currentStock = 0;

                        if (upgradeItem) {
                            const svgElement = upgradeItem.querySelector('svg[aria-label]');
                            if (svgElement) {
                                materialName = svgElement.getAttribute('aria-label');
                                itemId = utils.extractItemId(svgElement);
                                if (itemId) currentStock = utils.getCountById(itemId);
                            }
                        }

                        const totalNeeded = executionCount;
                        const supplementNeeded = Math.max(0, totalNeeded - currentStock);
                        requirements.push({ materialName, itemId, supplementNeeded, totalNeeded, currentStock, index: 0, type: 'upgrade' });
                    }
                }

                return requirements;
            }
        }

        //WHAT?
        (() => {
            const toast = new Toast();
            const k = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a'.split(',');
            const p = [];
            const f = e => {
                p.push(e.key);
                if (p.length > k.length) p.shift();
                if (k.every((v, i) => v === p[i])) {
                    removeEventListener('keydown', f);
                    toast.show('Keep this between us. Shhh...', 'success', 7000);
                }
            };
            addEventListener('keydown', f);
        })();

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
                        return false;
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

            createButton(text, onClick, isBidOrder = false) {
                const btn = document.createElement("button");
                btn.textContent = text;

                const bgColor = isBidOrder ? 'var(--color-market-sell)' : 'var(--color-market-buy)';
                const hoverColor = isBidOrder ? 'var(--color-market-sell-hover)' : 'var(--color-market-buy-hover)';

                utils.applyStyles(btn, {
                    padding: '0 6px', backgroundColor: bgColor, color: '#000', border: 'none', borderRadius: '4px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s ease',
                    fontFamily: '"Roboto"', textAlign: 'center', userSelect: 'none', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', height: '24px', lineHeight: '14px',
                    minWidth: 'auto', overflow: 'hidden', width: '100%'
                });

                btn.addEventListener('mouseenter', () => btn.style.backgroundColor = hoverColor);
                btn.addEventListener('mouseleave', () => btn.style.backgroundColor = bgColor);

                btn.addEventListener("click", async () => {
                    if (!this.loggerReady) {
                        console.error(LANG.wsNotAvailable);
                        return;
                    }

                    btn.disabled = true;
                    btn.textContent = isBidOrder ? LANG.bidOrderButtonActive : LANG.directBuyButtonActive;
                    utils.applyStyles(btn, { backgroundColor: "var(--color-disabled)", cursor: "not-allowed" });

                    try {
                        await onClick();
                    } catch (error) {
                        this.toast.show(\`\${LANG.purchaseError}: \${error.message}\`, 'error');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = text;
                        utils.applyStyles(btn, { backgroundColor: bgColor, cursor: "pointer" });
                    }
                });

                return btn;
            }

            createInfoSpan() {
                const span = document.createElement("span");
                span.textContent = \`\${LANG.missingPrefix}0\`;
                utils.applyStyles(span, {
                    fontSize: '12px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                    whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'center'
                });
                return span;
            }

            async updateInfoSpans(type) {
                const requirements = await MaterialCalculator.calculateRequirements(type);
                const className = \`\${type === 'house' ? 'house-' : type === 'enhancing' ? 'enhancing-' : ''}material-info-span\`;
                const materialRequirements = requirements.filter(req => req.type === 'material');

                document.querySelectorAll(\`.\${className}\`).forEach((span, index) => {
                    if (materialRequirements[index]) {
                        const needed = materialRequirements[index].supplementNeeded;
                        span.textContent = \`\${LANG.missingPrefix}\${needed}\`;
                        span.style.color = needed > 0 ? '#ff6b6b' : 'var(--color-text-dark-mode)';
                    }
                });

                const upgradeSpan = document.querySelector('.upgrade-info-span');
                const upgradeRequirement = requirements.find(req => req.type === 'upgrade');
                if (upgradeSpan) {
                    const needed = upgradeRequirement?.supplementNeeded || 0;
                    upgradeSpan.textContent = \`\${LANG.missingPrefix}\${needed}\`;
                    upgradeSpan.style.color = needed > 0 ? '#ff6b6b' : 'var(--color-text-dark-mode)';
                }
            }

            async purchaseFlow(type, isBidOrder = false) {
                if (!this.loggerReady) {
                    this.toast.show(LANG.wsNotAvailable, 'error');
                    return;
                }

                const requirements = await MaterialCalculator.calculateRequirements(type);
                const needToBuy = requirements.filter(item => 
                    item.itemId && item.itemId !== 'coin' && !item.itemId.includes('coin') && item.supplementNeeded > 0
                );

                if (needToBuy.length === 0) {
                    this.toast.show(LANG.noMaterialsNeeded, 'info');
                    return;
                }

                const itemList = needToBuy.map(item => 
                    \`\${item.materialName}: \${item.supplementNeeded}\${LANG.each}\`
                ).join(', ');

                const startMessage = \`\${isBidOrder ? LANG.startBidOrdering : LANG.startDirectPurchasing} \${needToBuy.length} \${LANG.materials}: \${itemList}\`;
                this.toast.show(startMessage, 'info');

                try {
                    const purchaseItems = needToBuy.map(item => ({
                        itemHrid: item.itemId.startsWith('/items/') ? item.itemId : \`/items/\${item.itemId}\`,
                        quantity: item.supplementNeeded,
                        materialName: item.materialName
                    }));

                    const results = isBidOrder ? 
                        await this.postMessageAPI.batchBidOrder(purchaseItems, 800) :
                        await this.postMessageAPI.batchDirectPurchase(purchaseItems, 800);

                    let successCount = 0;
                    results.forEach(result => {
                        const message = result.success ? 
                            \`\${isBidOrder ? LANG.orderSubmitted : LANG.purchased} \${result.item.materialName || result.item.itemHrid} x\${result.item.quantity}\` :
                            \`\${isBidOrder ? LANG.orderFailed : LANG.purchaseFailed} \${result.item.materialName || result.item.itemHrid}: \${result.error}\`;
                        
                        this.toast.show(message, result.success ? 'success' : 'error');
                        if (result.success) successCount++;
                    });

                    const finalMessage = successCount > 0 ? 
                        \`\${isBidOrder ? LANG.orderComplete : LANG.purchaseComplete} \${isBidOrder ? LANG.orderSuccess : LANG.purchaseSuccess} \${successCount}/\${needToBuy.length} \${LANG.materials}\` :
                        isBidOrder ? LANG.allOrdersFailed : LANG.allPurchasesFailed;

                    this.toast.show(finalMessage, successCount > 0 ? 'success' : 'error', successCount > 0 ? 5000 : 3000);
                    if (successCount > 0) setTimeout(() => this.updateInfoSpans(type), 2000);

                } catch (error) {
                    this.toast.show(\`\${LANG.purchaseError}: \${error.message}\`, 'error');
                }
            }

            initObserver() {
                if (this.observer) return;

                this.observer = new MutationObserver(() => {
                    ['production', 'house', 'enhancing'].forEach(type => this.setupUI(type));
                });

                this.observer.observe(document.body, { childList: true, subtree: true });

                let updateTimer = null;
                document.addEventListener('input', (e) => {
                    if (e.target.classList.contains('Input_input__2-t98')) {
                        clearTimeout(updateTimer);
                        updateTimer = setTimeout(() => {
                            this.updateInfoSpans('enhancing');
                            this.updateInfoSpans('production');
                        }, 1);
                    }
                });

                ['production', 'house', 'enhancing'].forEach(type => this.setupUI(type));
            }

            setupUI(type) {
                const configs = {
                    production: { className: 'material-info-span', gridCols: 'auto min-content auto auto', buttonParent: 'nameDiv' },
                    house: { className: 'house-material-info-span', gridCols: 'auto auto auto 120px', buttonParent: 'headerDiv' },
                    enhancing: { className: 'enhancing-material-info-span', gridCols: 'auto min-content auto auto', buttonParent: 'cost' }
                };

                const selectors = SELECTORS[type];
                const config = configs[type];

                document.querySelectorAll(selectors.container).forEach(panel => {
                    const dataAttr = \`\${type}ButtonInserted\`;
                    if (panel.dataset[dataAttr]) return;

                    // 对于强化界面，检查是否有说明文字
                    if (type === 'enhancing' && panel.querySelector(selectors.instructions)) return;

                    const requirements = panel.querySelector(selectors.requirements);
                    if (!requirements) return;

                    panel.dataset[dataAttr] = "true";

                    // 设置普通材料UI
                    const modifiedAttr = \`\${type}Modified\`;
                    if (!requirements.dataset[modifiedAttr]) {
                        requirements.dataset[modifiedAttr] = "true";
                        requirements.style.gridTemplateColumns = config.gridCols;

                        requirements.querySelectorAll('.Item_itemContainer__x7kH1').forEach(item => {
                            if (item.nextSibling?.classList?.contains(config.className)) return;
                            const span = this.createInfoSpan();
                            span.className = config.className;
                            item.parentNode.insertBefore(span, item.nextSibling);
                        });
                    }

                    // 设置升级物品UI（仅production类型）
                    if (type === 'production') {
                        const upgradeContainer = panel.querySelector(selectors.upgradeSelector);
                        if (upgradeContainer && !upgradeContainer.dataset.upgradeModified) {
                            upgradeContainer.dataset.upgradeModified = "true";
                            if (!upgradeContainer.querySelector('.upgrade-info-span')) {
                                const upgradeSpan = this.createInfoSpan();
                                upgradeSpan.className = 'upgrade-info-span';
                                upgradeContainer.appendChild(upgradeSpan);
                            }
                        }
                    }

                    setTimeout(() => this.updateInfoSpans(type), 100);

                    // 添加购买按钮
                    let buttonContainer = panel.querySelector('.buy-buttons-container');
                    if (!buttonContainer) {
                        buttonContainer = document.createElement('div');
                        buttonContainer.className = 'buy-buttons-container';
                        
                        const baseStyles = { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' };
                        const typeStyles = {
                            house: { width: 'fit-content', margin: '0 auto', maxWidth: '280px', minWidth: '260px' },
                            enhancing: { width: 'fit-content', margin: '0 auto', maxWidth: '300px', minWidth: '260px' }
                        };
                        
                        utils.applyStyles(buttonContainer, { ...baseStyles, ...typeStyles[type] });

                        const directBuyBtn = this.createButton(LANG.directBuyButton, () => this.purchaseFlow(type, false), false);
                        const bidOrderBtn = this.createButton(LANG.bidOrderButton, () => this.purchaseFlow(type, true), true);

                        [directBuyBtn, bidOrderBtn].forEach(btn => {
                            btn.style.flex = '1';
                            buttonContainer.appendChild(btn);
                        });

                        const insertionMap = {
                            production: () => {
                                const parentDiv = panel.querySelector(selectors[config.buttonParent]);
                                parentDiv.parentNode.insertBefore(buttonContainer, parentDiv.nextSibling);
                            },
                            house: () => {
                                const parentDiv = panel.querySelector(selectors[config.buttonParent]);
                                parentDiv.parentNode.insertBefore(buttonContainer, parentDiv);
                            },
                            enhancing: () => {
                                const parentDiv = panel.querySelector(selectors[config.buttonParent]);
                                parentDiv.parentNode.insertBefore(buttonContainer, parentDiv);
                                // if (infoDiv) {
                                //     buttonContainer.style.marginTop = '10px';
                                //     infoDiv.appendChild(buttonContainer);
                                // }
                            }
                        };

                        insertionMap[type]?.();
                    }
                });
            }
        }

        new UIManager();
    })();
    `;

    // WebSocket 拦截和 API 设置
    function setupWebSocketAndAPI() {
        // Mooket 接口检测函数
        const isMooketAPIAvailable = () => {
            if (!window.mwi) {
                return false;
            }

            if (!window.mwi.MWICoreInitialized) {
                return false;
            }

            if (!window.mwi.game) {
                return false;
            }

            return true;
        };

        window.wsInstances = [];
        window.currentWS = null;
        window.wsMessageListeners = new Set();
        window.wsRequestHandlers = new Map();
        window.wsPurchaseQueue = [];
        window.wsMarketDataCache = new Map();

        // 设置原生 WebSocket 拦截
        setupOriginalWebSocketMode();

        // PostMessage 处理器
        window.addEventListener('message', async (event) => {
            if (event.origin !== window.location.origin || event.data?.type !== 'ws_request') return;

            const { action, data, requestId } = event.data;

            try {
                let result;
                switch (action) {
                    case 'check_api':
                        result = {
                            available: true,
                            ws_ready: mooketMode ? isMooketAPIAvailable() : !!window.currentWS,
                            mode: mooketMode ? 'Mooket接口' : 'WebSocket'
                        };
                        break;
                    case 'get_market_data':
                        result = await handleGetMarketData(data);
                        break;
                    case 'direct_purchase':
                        result = await handleDirectPurchase(data);
                        break;
                    case 'batch_direct_purchase':
                        result = await handleBatchDirectPurchase(data);
                        break;
                    case 'bid_order':
                        result = await handleBidOrder(data);
                        break;
                    case 'batch_bid_order':
                        result = await handleBatchBidOrder(data);
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

            // 优先使用Mooket接口模式（如果可用）
            if (mooketMode && isMooketAPIAvailable()) {
                console.log('[调试] 使用Mooket接口模式获取市场数据');
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('获取市场数据超时')), 8000);

                    const responseHandler = (obj) => {
                        if (obj.marketItemOrderBooks?.itemHrid === fullItemHrid) {
                            clearTimeout(timeout);
                            // 缓存数据
                            window.wsMarketDataCache.set(fullItemHrid, {
                                data: obj.marketItemOrderBooks,
                                timestamp: Date.now()
                            });
                            resolve(obj.marketItemOrderBooks);
                        }
                    };

                    // 注册一次性监听器
                    const onceHandler = (obj) => {
                        responseHandler(obj);
                        window.removeEventListener('MWI_market_item_order_books_updated', onceHandler);
                    };

                    window.addEventListener('MWI_market_item_order_books_updated', (e) => onceHandler(e.detail));

                    // 请求市场数据
                    try {
                        window.mwi.game.handleGetMarketItemOrderBooks(fullItemHrid);
                    } catch (error) {
                        clearTimeout(timeout);
                        reject(new Error(`Mooket接口请求失败: ${error.message}`));
                    }
                });
            } else {
                // 使用原始WebSocket模式
                console.log('[调试] 使用WebSocket模式获取市场数据');
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
                            window.wsMarketDataCache.set(fullItemHrid, {
                                data: responseData.marketItemOrderBooks,
                                timestamp: Date.now()
                            });
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
        }

        // 直接购买处理
        async function handleDirectPurchase({ itemHrid, quantity }) {
            const marketData = await handleGetMarketData({ itemHrid });
            const priceAnalysis = analyzeMarketPrice(marketData, quantity);
            const result = await executeDirectPurchase(itemHrid, quantity, priceAnalysis.maxPrice);
            return { success: true, result };
        }

        // 求购订单处理
        async function handleBidOrder({ itemHrid, quantity }) {
            const marketData = await handleGetMarketData({ itemHrid });
            const priceAnalysis = analyzeBidPrice(marketData, quantity);
            const result = await executeBidOrder(itemHrid, quantity, priceAnalysis.maxPrice);
            return { success: true, result };
        }

        // 批量处理函数
        async function handleBatchDirectPurchase({ items, delayBetween = 800 }) {
            const results = [];
            for (let i = 0; i < items.length; i++) {
                try {
                    const result = await handleDirectPurchase(items[i]);
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

        async function handleBatchBidOrder({ items, delayBetween = 800 }) {
            const results = [];
            for (let i = 0; i < items.length; i++) {
                try {
                    const result = await handleBidOrder(items[i]);
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

        // 执行购买操作
        async function executeDirectPurchase(itemHrid, quantity, price, enhancementLevel = 0) {
            const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

            if (mooketMode && isMooketAPIAvailable()) {
                console.log('[调试] 使用Mooket接口模式执行购买');
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('购买超时')), 15000);

                    const successHandler = (obj) => {
                        if (obj.message === 'infoNotification.buyOrderCompleted') {
                            clearTimeout(timeout);
                            resolve(obj);
                            window.removeEventListener('MWI_info', onceSuccessHandler);
                            window.removeEventListener('MWI_error', onceErrorHandler);
                        }
                    };

                    const errorHandler = (obj) => {
                        clearTimeout(timeout);
                        reject(new Error(obj.message || '购买失败'));
                        window.removeEventListener('MWI_info', onceSuccessHandler);
                        window.removeEventListener('MWI_error', onceErrorHandler);
                    };

                    const onceSuccessHandler = (e) => successHandler(e.detail);
                    const onceErrorHandler = (e) => errorHandler(e.detail);

                    window.addEventListener('MWI_info', onceSuccessHandler);
                    window.addEventListener('MWI_error', onceErrorHandler);

                    try {
                        window.mwi.game.handlePostMarketOrder(false, fullItemHrid, enhancementLevel, quantity, price, true);
                    } catch (error) {
                        clearTimeout(timeout);
                        window.removeEventListener('MWI_info', onceSuccessHandler);
                        window.removeEventListener('MWI_error', onceErrorHandler);
                        reject(new Error(`Mooket接口购买请求失败: ${error.message}`));
                    }
                });
            } else {
                // 使用原始WebSocket模式
                console.log('[调试] 使用WebSocket模式执行购买');
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
        }

        async function executeBidOrder(itemHrid, quantity, price, enhancementLevel = 0) {
            const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

            if (mooketMode && isMooketAPIAvailable()) {
                try {
                    window.mwi.game.handlePostMarketOrder(false, fullItemHrid, enhancementLevel, quantity, price, false);
                    return { message: '订单已提交' };
                } catch (error) {
                    throw new Error(`Mooket接口求购订单失败: ${error.message}`);
                }
            } else {
                // 原始WebSocket模式
                return new Promise((resolve, reject) => {
                    if (!window.currentWS || window.currentWS.readyState !== WebSocket.OPEN) {
                        reject(new Error('WebSocket连接不可用'));
                        return;
                    }

                    window.currentWS.send(JSON.stringify({
                        type: "post_market_order",
                        postMarketOrderData: {
                            isSell: false,
                            itemHrid: fullItemHrid,
                            enhancementLevel,
                            quantity,
                            price,
                            isInstantOrder: false
                        }
                    }));

                    resolve({ message: '订单已提交' });
                });
            }
        }

        // 价格分析函数
        function analyzeMarketPrice(marketData, neededQuantity) {
            const asks = marketData.orderBooks?.[0]?.asks;
            if (!asks?.length) throw new Error('没有可用的卖单');

            let cumulativeQuantity = 0;
            let targetPrice = 0;

            for (const ask of asks) {
                const availableFromThisOrder = Math.min(ask.quantity, neededQuantity - cumulativeQuantity);
                cumulativeQuantity += availableFromThisOrder;
                targetPrice = ask.price;

                if (cumulativeQuantity >= neededQuantity) break;
            }

            if (cumulativeQuantity < neededQuantity) {
                throw new Error(`市场库存不足。可用: ${cumulativeQuantity}, 需要: ${neededQuantity}`);
            }

            return {
                maxPrice: targetPrice,
                availableQuantity: cumulativeQuantity
            };
        }

        function analyzeBidPrice(marketData, neededQuantity) {
            const bids = marketData.orderBooks?.[0]?.bids;
            if (!bids?.length) throw new Error('没有可用的买单');

            const targetPrice = bids[0].price;

            return {
                maxPrice: targetPrice,
                availableQuantity: neededQuantity
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

            // 缓存处理
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

        // 原生 WebSocket 模式设置（立即设置，确保拦截）
        function setupOriginalWebSocketMode() {
            console.log('[调试] 设置原生 WebSocket 拦截');

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
                        console.log('[调试] WebSocket连接已建立');

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
        }

        // Mooket接口检测和模式切换
        const checkAndSwitchToMooket = () => {
            if (!mooketMode && isMooketAPIAvailable()) {
                console.info('%c[MWI-AutoBuyer] 检测到Mooket接口可用，切换到Mooket接口模式', 'color: #2196F3; font-weight: bold;');
                mooketMode = true;
                return true;
            }
            return false;
        };

        // 监听 Mooket 初始化事件
        window.addEventListener('MWICoreInitialized', () => {
            console.info('%c[MWI-AutoBuyer] 收到Mooket接口初始化事件', 'color: #2196F3; font-weight: bold;');
            checkAndSwitchToMooket();
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

    setupWebSocketAndAPI();
})();