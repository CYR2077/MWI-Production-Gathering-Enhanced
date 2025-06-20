// ==UserScript==
// @name         [银河奶牛]自动计算购买材料
// @name:zh-CN   [银河奶牛]自动计算购买材料
// @name:en      MWI-AutoBuyer
// @namespace    http://tampermonkey.net/
// @version      2.3.2
// @description  自动计算制造、烹饪、强化、房屋等所需材料，一键购买缺少的材料
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

    const AUTO_BUY_SCRIPT = `
    (function () {
        'use strict';

        // 常量配置
        const CONFIG = {
            DELAYS: { API_CHECK: 2000, PURCHASE: 800, UPDATE: 100 },
            TIMEOUTS: { API: 8000, PURCHASE: 15000 },
            CACHE_TTL: 60000,
            COLORS: {
                buy: 'var(--color-market-buy)',
                buyHover: 'var(--color-market-buy-hover)',
                sell: 'var(--color-market-sell)',
                sellHover: 'var(--color-market-sell-hover)',
                disabled: 'var(--color-disabled)',
                error: '#ff6b6b',
                text: 'var(--color-text-dark-mode)'
            }
        };

        // 语言配置
        const LANG = (navigator.language || 'en').toLowerCase().includes('zh') ? {
            directBuy: '直够材料(左一)', bidOrder: '求购材料(右一)', 
            directBuyUpgrade: '左一', bidOrderUpgrade: '右一',
            buying: '⏳ 购买中...', submitting: '📋 提交中...',
            missing: '缺:', sufficient: '材料充足！', sufficientUpgrade: '升级物品充足！',
            starting: '开始', materials: '种材料', upgradeItems: '种升级物品',
            purchased: '已购买', submitted: '订单已提交', failed: '失败', complete: '完成！',
            error: '出错，请检查控制台', wsNotAvailable: 'WebSocket接口未可用', waiting: '等待接口就绪...',
            ready: '接口已就绪！', success: '成功', each: '个', allFailed: '全部失败'
        } : {
            directBuy: 'Buy Materials', bidOrder: 'Bid Materials', 
            directBuyUpgrade: 'Buy', bidOrderUpgrade: 'Bid',
            buying: '⏳ Buying...', submitting: '📋 Submitting...',
            missing: 'Need:', sufficient: 'All materials sufficient!', sufficientUpgrade: 'All upgrades sufficient!',
            starting: 'Start', materials: 'materials', upgradeItems: 'upgrade items',
            purchased: 'Purchased', submitted: 'Order submitted', failed: 'failed', complete: 'completed!',
            error: 'error, check console', wsNotAvailable: 'WebSocket interface not available', waiting: 'Waiting for interface...',
            ready: 'Interface ready!', success: 'Successfully', each: '', allFailed: 'All failed'
        };

        // 选择器配置
        const SELECTORS = {
            production: {
                container: '.SkillActionDetail_regularComponent__3oCgr',
                input: '.SkillActionDetail_maxActionCountInput__1C0Pw .Input_input__2-t98',
                requirements: '.SkillActionDetail_itemRequirements__3SPnA',
                upgrade: '.SkillActionDetail_upgradeItemSelectorInput__2mnS0',
                name: '.SkillActionDetail_name__3erHV',
                count: '.SkillActionDetail_inputCount__1rdrn'
            },
            house: {
                container: '.HousePanel_modalContent__3AwPH',
                requirements: '.HousePanel_itemRequirements__1qFjZ',
                header: '.HousePanel_header__3QdpP',
                count: '.HousePanel_inputCount__26GPq'
            },
            enhancing: {
                container: '.SkillActionDetail_enhancingComponent__17bOx',
                input: '.SkillActionDetail_maxActionCountInput__1C0Pw .Input_input__2-t98',
                requirements: '.SkillActionDetail_itemRequirements__3SPnA',
                count: '.SkillActionDetail_inputCount__1rdrn',
                instructions: '.SkillActionDetail_instructions___EYV5',
                cost: '.SkillActionDetail_costs__3Q6Bk'
            }
        };

        // 工具函数
        const utils = {
            getCountById(id) {
                const container = document.querySelector('.Inventory_inventory__17CH2')?.lastChild;
                if (!container) return 0;

                const items = container.querySelectorAll(".Item_item__2De2O.Item_clickable__3viV6");
                for (let item of items) {
                    try {
                        const reactKey = Object.keys(item).find(key => key.startsWith('__reactProps'));
                        if (reactKey) {
                            const itemHrid = item[reactKey].children[0][1]._owner.memoizedProps.itemHrid;
                            if (itemHrid === \`/items/\${id}\`) {
                                return item[reactKey].children[0][1]._owner.memoizedProps.count;
                            }
                        }
                    } catch { continue; }
                }
                return 0;
            },

            extractItemId(svgElement) {
                return svgElement?.querySelector('use')?.getAttribute('href')?.match(/#(.+)\$/)?.[1] || null;
            },

            applyStyles(element, styles) {
                Object.assign(element.style, styles);
            },

            createPromiseWithHandlers() {
                let resolve, reject;
                const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
                return { promise, resolve, reject };
            },

            delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
        };

        // 简化的API客户端
        class AutoBuyAPI {
            constructor() {
                this.isReady = false;
                this.init();
            }

            async init() {
                while (!window.AutoBuyAPI?.checkAPI) {
                    await utils.delay(1000);
                }
                this.isReady = true;
            }

            async waitForReady() {
                while (!this.isReady) await utils.delay(100);
            }

            async executeRequest(method, ...args) {
                await this.waitForReady();
                return await window.AutoBuyAPI[method](...args);
            }

            async checkAPI() { return this.executeRequest('checkAPI'); }
            async batchDirectPurchase(items, delay) { return this.executeRequest('batchDirectPurchase', items, delay); }
            async batchBidOrder(items, delay) { return this.executeRequest('batchBidOrder', items, delay); }
        }

        // 通知系统
        class Toast {
            constructor() {
                this.container = this.createContainer();
            }

            createContainer() {
                const container = document.createElement('div');
                utils.applyStyles(container, {
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    zIndex: '10000', pointerEvents: 'none'
                });
                document.body.appendChild(container);
                return container;
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
                requestAnimationFrame(() => utils.applyStyles(toast, { opacity: '1', transform: 'translateY(0)' }));
                
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
                const executionCount = this.getExecutionCount(container, selectors, type);

                // 计算普通材料需求
                this.calculateMaterialRequirements(container, selectors, executionCount, type, requirements);

                // 计算升级物品需求（仅production类型）
                if (type === 'production') {
                    this.calculateUpgradeRequirements(container, selectors, executionCount, requirements);
                }

                return requirements;
            }

            static getExecutionCount(container, selectors, type) {
                if (type === 'house') return 0;
                const actionInput = container.querySelector(selectors.input);
                return parseInt(actionInput?.value) || 0;
            }

            static calculateMaterialRequirements(container, selectors, executionCount, type, requirements) {
                const requirementsContainer = container.querySelector(selectors.requirements);
                if (!requirementsContainer) return;

                const materialContainers = requirementsContainer.querySelectorAll('.Item_itemContainer__x7kH1');
                const inputCounts = requirementsContainer.querySelectorAll(selectors.count);

                materialContainers.forEach((materialContainer, i) => {
                    const nameElement = materialContainer.querySelector('.Item_name__2C42x');
                    const svgElement = materialContainer.querySelector('svg[aria-label]');
                    if (!nameElement || !svgElement) return;

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
                });
            }

            static calculateUpgradeRequirements(container, selectors, executionCount, requirements) {
                const upgradeContainer = container.querySelector(selectors.upgrade);
                if (!upgradeContainer) return;

                const upgradeItem = upgradeContainer.querySelector('.Item_item__2De2O');
                if (!upgradeItem) return;

                const svgElement = upgradeItem.querySelector('svg[aria-label]');
                if (!svgElement) return;

                const materialName = svgElement.getAttribute('aria-label');
                const itemId = utils.extractItemId(svgElement);
                const currentStock = itemId ? utils.getCountById(itemId) : 0;
                const totalNeeded = executionCount;
                const supplementNeeded = Math.max(0, totalNeeded - currentStock);

                requirements.push({ materialName, itemId, supplementNeeded, totalNeeded, currentStock, index: 0, type: 'upgrade' });
            }
        }

        // UI管理器
        class UIManager {
            constructor() {
                this.toast = new Toast();
                this.api = new AutoBuyAPI();
                this.observer = null;
                this.loggerReady = false;
                this.init();
            }

            async init() {
                await this.checkLoggerAndInit();
                this.setupEasterEgg();
            }

            setupEasterEgg() {
                const keys = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a'.split(',');
                const pressed = [];
                const handler = e => {
                    pressed.push(e.key);
                    if (pressed.length > keys.length) pressed.shift();
                    if (keys.every((v, i) => v === pressed[i])) {
                        removeEventListener('keydown', handler);
                        this.toast.show('Keep this between us. Shhh...', 'success', 7000);
                    }
                };
                addEventListener('keydown', handler);
            }

            async checkLoggerAndInit() {
                while (true) {
                    try {
                        const result = await this.api.checkAPI();
                        if (result.available && result.core_ready) {
                            this.loggerReady = true;
                            console.log(\`%c[MWI-AutoBuyer] \${LANG.ready}\`, 'color: #4CAF50; font-weight: bold;');
                            this.initObserver();
                            break;
                        }
                    } catch {}
                    
                    console.log(\`[MWI-AutoBuyer] \${LANG.waiting}\`);
                    await utils.delay(CONFIG.DELAYS.API_CHECK);
                }
            }

            createButton(text, onClick, isBidOrder = false) {
                const btn = document.createElement("button");
                btn.textContent = text;

                const bgColor = isBidOrder ? CONFIG.COLORS.sell : CONFIG.COLORS.buy;
                const hoverColor = isBidOrder ? CONFIG.COLORS.sellHover : CONFIG.COLORS.buyHover;

                utils.applyStyles(btn, {
                    padding: '0 6px', backgroundColor: bgColor, color: '#000', border: 'none', borderRadius: '4px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s ease',
                    fontFamily: '"Roboto"', height: '24px', flex: '1'
                });

                btn.addEventListener('mouseenter', () => btn.style.backgroundColor = hoverColor);
                btn.addEventListener('mouseleave', () => btn.style.backgroundColor = bgColor);
                btn.addEventListener("click", () => this.handleButtonClick(btn, text, onClick, isBidOrder, bgColor));

                return btn;
            }

            async handleButtonClick(btn, originalText, onClick, isBidOrder, originalColor) {
                if (!this.loggerReady) {
                    console.error(LANG.wsNotAvailable);
                    return;
                }

                btn.disabled = true;
                btn.textContent = isBidOrder ? LANG.submitting : LANG.buying;
                utils.applyStyles(btn, { backgroundColor: CONFIG.COLORS.disabled, cursor: "not-allowed" });

                try {
                    await onClick();
                } catch (error) {
                    this.toast.show(\`\${LANG.error}: \${error.message}\`, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = originalText;
                    utils.applyStyles(btn, { backgroundColor: originalColor, cursor: "pointer" });
                }
            }

            createInfoSpan() {
                const span = document.createElement("span");
                span.textContent = \`\${LANG.missing}0\`;
                utils.applyStyles(span, {
                    fontSize: '12px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                    whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'center'
                });
                return span;
            }

            async updateInfoSpans(type) {
                const requirements = await MaterialCalculator.calculateRequirements(type);
                const className = \`\${type === 'house' ? 'house-' : type === 'enhancing' ? 'enhancing-' : ''}material-info-span\`;
                
                // 更新普通材料信息
                document.querySelectorAll(\`.\${className}\`).forEach((span, index) => {
                    const materialReq = requirements.filter(req => req.type === 'material')[index];
                    if (materialReq) {
                        const needed = materialReq.supplementNeeded;
                        span.textContent = \`\${LANG.missing}\${needed}\`;
                        span.style.color = needed > 0 ? CONFIG.COLORS.error : CONFIG.COLORS.text;
                    }
                });

                // 更新升级物品信息
                const upgradeSpan = document.querySelector('.upgrade-info-span');
                const upgradeReq = requirements.find(req => req.type === 'upgrade');
                if (upgradeSpan && upgradeReq) {
                    const needed = upgradeReq.supplementNeeded;
                    upgradeSpan.textContent = \`\${LANG.missing}\${needed}\`;
                    upgradeSpan.style.color = needed > 0 ? CONFIG.COLORS.error : CONFIG.COLORS.text;
                }
            }

            async purchaseMaterials(type, isBidOrder = false) {
                if (!this.loggerReady) {
                    this.toast.show(LANG.wsNotAvailable, 'error');
                    return;
                }

                const requirements = await MaterialCalculator.calculateRequirements(type);
                const needToBuy = requirements.filter(item => 
                    item.type === 'material' && item.itemId && !item.itemId.includes('coin') && item.supplementNeeded > 0
                );

                if (needToBuy.length === 0) {
                    this.toast.show(LANG.sufficient, 'info');
                    return;
                }

                const itemList = needToBuy.map(item => 
                    \`\${item.materialName}: \${item.supplementNeeded}\${LANG.each}\`
                ).join(', ');

                this.toast.show(\`\${LANG.starting} \${needToBuy.length} \${LANG.materials}: \${itemList}\`, 'info');

                try {
                    const purchaseItems = needToBuy.map(item => ({
                        itemHrid: item.itemId.startsWith('/items/') ? item.itemId : \`/items/\${item.itemId}\`,
                        quantity: item.supplementNeeded,
                        materialName: item.materialName
                    }));

                    const results = isBidOrder ? 
                        await this.api.batchBidOrder(purchaseItems, CONFIG.DELAYS.PURCHASE) :
                        await this.api.batchDirectPurchase(purchaseItems, CONFIG.DELAYS.PURCHASE);

                    this.processResults(results, isBidOrder, type);

                } catch (error) {
                    this.toast.show(\`\${LANG.error}: \${error.message}\`, 'error');
                }
            }

            async purchaseUpgrades(type, isBidOrder = false) {
                if (!this.loggerReady) {
                    this.toast.show(LANG.wsNotAvailable, 'error');
                    return;
                }

                const requirements = await MaterialCalculator.calculateRequirements(type);
                const needToBuy = requirements.filter(item => 
                    item.type === 'upgrade' && item.itemId && !item.itemId.includes('coin') && item.supplementNeeded > 0
                );

                if (needToBuy.length === 0) {
                    this.toast.show(LANG.sufficientUpgrade, 'info');
                    return;
                }

                const itemList = needToBuy.map(item => 
                    \`\${item.materialName}: \${item.supplementNeeded}\${LANG.each}\`
                ).join(', ');

                this.toast.show(\`\${LANG.starting} \${needToBuy.length} \${LANG.upgradeItems}: \${itemList}\`, 'info');

                try {
                    const purchaseItems = needToBuy.map(item => ({
                        itemHrid: item.itemId.startsWith('/items/') ? item.itemId : \`/items/\${item.itemId}\`,
                        quantity: item.supplementNeeded,
                        materialName: item.materialName
                    }));

                    const results = isBidOrder ? 
                        await this.api.batchBidOrder(purchaseItems, CONFIG.DELAYS.PURCHASE) :
                        await this.api.batchDirectPurchase(purchaseItems, CONFIG.DELAYS.PURCHASE);

                    this.processResults(results, isBidOrder, type);

                } catch (error) {
                    this.toast.show(\`\${LANG.error}: \${error.message}\`, 'error');
                }
            }

            processResults(results, isBidOrder, type) {
                let successCount = 0;
                
                results.forEach(result => {
                    const statusText = isBidOrder ? 
                        (result.success ? LANG.submitted : LANG.failed) :
                        (result.success ? LANG.purchased : LANG.failed);
                    
                    const message = \`\${statusText} \${result.item.materialName || result.item.itemHrid} x\${result.item.quantity}\`;
                    this.toast.show(message, result.success ? 'success' : 'error');
                    
                    if (result.success) successCount++;
                });

                const finalMessage = successCount > 0 ? 
                    \`\${LANG.complete} \${LANG.success} \${successCount}/\${results.length} \${LANG.materials}\` :
                    LANG.allFailed;

                this.toast.show(finalMessage, successCount > 0 ? 'success' : 'error', successCount > 0 ? 5000 : 3000);
                
                if (successCount > 0) {
                    setTimeout(() => this.updateInfoSpans(type), 2000);
                }
            }

            initObserver() {
                if (this.observer) return;

                this.observer = new MutationObserver(() => {
                    Object.keys(SELECTORS).forEach(type => this.setupUI(type));
                });

                this.observer.observe(document.body, { childList: true, subtree: true });

                // 输入监听
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

                document.addEventListener('click', (e) => {
                    if (e.target.classList) {
                        clearTimeout(updateTimer);
                        updateTimer = setTimeout(() => {
                            this.updateInfoSpans('enhancing');
                            this.updateInfoSpans('production');
                        }, 1);
                    }
                });

                // 初始设置
                Object.keys(SELECTORS).forEach(type => this.setupUI(type));
            }

            setupUI(type) {
                const configs = {
                    production: { className: 'material-info-span', gridCols: 'auto min-content auto auto', buttonParent: 'name' },
                    house: { className: 'house-material-info-span', gridCols: 'auto auto auto 120px', buttonParent: 'header' },
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

                    this.setupMaterialInfo(requirements, config, type);
                    this.setupUpgradeInfo(panel, selectors, type);
                    this.setupButtons(panel, selectors, config, type);
                    
                    setTimeout(() => this.updateInfoSpans(type), CONFIG.DELAYS.UPDATE);
                });
            }

            setupMaterialInfo(requirements, config, type) {
                const modifiedAttr = \`\${type}Modified\`;
                if (requirements.dataset[modifiedAttr]) return;

                requirements.dataset[modifiedAttr] = "true";
                requirements.style.gridTemplateColumns = config.gridCols;

                requirements.querySelectorAll('.Item_itemContainer__x7kH1').forEach(item => {
                    if (item.nextSibling?.classList?.contains(config.className)) return;
                    const span = this.createInfoSpan();
                    span.className = config.className;
                    item.parentNode.insertBefore(span, item.nextSibling);
                });
            }

            setupUpgradeInfo(panel, selectors, type) {
                if (type !== 'production') return;

                const upgradeContainer = panel.querySelector(selectors.upgrade);
                if (!upgradeContainer || upgradeContainer.dataset.upgradeModified) return;

                upgradeContainer.dataset.upgradeModified = "true";
                if (!upgradeContainer.querySelector('.upgrade-info-span')) {
                    const upgradeSpan = this.createInfoSpan();
                    upgradeSpan.className = 'upgrade-info-span';
                    upgradeContainer.appendChild(upgradeSpan);
                }
            }

            setupButtons(panel, selectors, config, type) {
                if (panel.querySelector('.buy-buttons-container')) return;

                // 材料购买按钮容器
                const materialButtonContainer = document.createElement('div');
                materialButtonContainer.className = 'buy-buttons-container';

                const baseStyles = { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', marginBottom: '8px' };
                const typeStyles = {
                    house: { width: 'fit-content', margin: '0 auto 8px auto', maxWidth: '280px', minWidth: '260px' },
                    enhancing: { width: 'fit-content', margin: '0 auto 8px auto', maxWidth: '300px', minWidth: '260px' }
                };
                
                utils.applyStyles(materialButtonContainer, { ...baseStyles, ...typeStyles[type] });

                // 材料购买按钮
                const directBuyBtn = this.createButton(LANG.directBuy, () => this.purchaseMaterials(type, false), false);
                const bidOrderBtn = this.createButton(LANG.bidOrder, () => this.purchaseMaterials(type, true), true);
                materialButtonContainer.append(directBuyBtn, bidOrderBtn);

                // 处理升级物品购买按钮（仅限production类型）
                if (type === 'production') {
                    const upgradeContainer = panel.querySelector(selectors.upgrade);
                    if (upgradeContainer && !upgradeContainer.querySelector('.upgrade-buttons-container')) {
                        const upgradeButtonContainer = document.createElement('div');
                        upgradeButtonContainer.className = 'upgrade-buttons-container';
                        utils.applyStyles(upgradeButtonContainer, { 
                            display: 'flex', 
                            gap: '6px', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            marginTop: '8px',
                            width: '100%'
                        });

                        const directBuyUpgradeBtn = this.createButton(LANG.directBuyUpgrade, () => this.purchaseUpgrades(type, false), false);
                        const bidOrderUpgradeBtn = this.createButton(LANG.bidOrderUpgrade, () => this.purchaseUpgrades(type, true), true);
                        upgradeButtonContainer.append(directBuyUpgradeBtn, bidOrderUpgradeBtn);
                        
                        upgradeContainer.appendChild(upgradeButtonContainer);
                    }
                }

                const insertionMethods = {
                    production: () => {
                        const parent = panel.querySelector(selectors[config.buttonParent]);
                        parent.parentNode.insertBefore(materialButtonContainer, parent.nextSibling);
                    },
                    house: () => {
                        const parent = panel.querySelector(selectors[config.buttonParent]);
                        parent.parentNode.insertBefore(materialButtonContainer, parent);
                    },
                    enhancing: () => {
                        const parent = panel.querySelector(selectors[config.buttonParent]);
                        parent.parentNode.insertBefore(materialButtonContainer, parent);
                    }
                };

                insertionMethods[type]?.();
            }
        }

        new UIManager();
    })();
    `;

    // 初始化状态
    const state = {
        wsInstances: [],
        currentWS: null,
        requestHandlers: new Map(),
        marketDataCache: new Map()
    };

    Object.assign(window, state);

    // AutoBuyAPI 核心对象
    window.AutoBuyAPI = {
        core: null,

        async checkAPI() {
            return {
                available: true,
                core_ready: !!this.core,
                ws_ready: !!window.currentWS
            };
        },

        async batchDirectPurchase(items, delayBetween = 800) {
            return processItems(items, delayBetween, directPurchase);
        },

        async batchBidOrder(items, delayBetween = 800) {
            return processItems(items, delayBetween, bidOrder);
        },

        hookMessage(messageType, callback, filter = null) {
            if (typeof messageType !== 'string' || !messageType) {
                throw new Error('messageType 必须是非空字符串');
            }
            
            if (typeof callback !== 'function') {
                throw new Error('callback 必须是函数');
            }

            const wrappedHandler = (responseData) => {
                try {
                    if (filter && !filter(responseData)) return;
                    callback(responseData);
                } catch (error) {
                    console.error(`[AutoBuyAPI.hookMessage] 处理消息时出错:`, error);
                }
            };

            registerHandler(messageType, wrappedHandler);

            return function unhook() {
                unregisterHandler(messageType, wrappedHandler);
            };
        },

        waitForMessage(messageType, timeout = 10000, filter = null) {
            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    unhook();
                    reject(new Error(`等待消息类型 '${messageType}' 超时 (${timeout}ms)`));
                }, timeout);

                const unhook = this.hookMessage(messageType, (responseData) => {
                    clearTimeout(timeoutId);
                    unhook();
                    resolve(responseData);
                }, filter);
            });
        },

        getHookStats() {
            const stats = {};
            let totalHooks = 0;
            
            for (const [messageType, handlers] of window.requestHandlers.entries()) {
                stats[messageType] = handlers.size;
                totalHooks += handlers.size;
            }
            
            return { totalHooks, byMessageType: stats };
        },

        clearHooks(messageType) {
            const handlers = window.requestHandlers.get(messageType);
            if (!handlers) return 0;
            
            const count = handlers.size;
            window.requestHandlers.delete(messageType);
            return count;
        }
    };

    // WebSocket 拦截设置
    function setupWebSocketInterception() {
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = new Proxy(OriginalWebSocket, {
            construct(target, args) {
                const ws = new target(...args);
                window.wsInstances.push(ws);
                window.currentWS = ws;

                // 消息拦截
                const originalSend = ws.send;
                ws.send = function (data) {
                    try { dispatchMessage(JSON.parse(data), 'send'); } catch { }
                    return originalSend.call(this, data);
                };

                ws.addEventListener("message", (event) => {
                    try { dispatchMessage(JSON.parse(event.data), 'receive'); } catch { }
                });

                ws.addEventListener("open", () => {
                    console.log('[调试] WebSocket连接已建立');
                    setTimeout(() => initGameCore(), 500);

                    if (window.wsInstances.length === 1 && !scriptInjected) {
                        setTimeout(injectLocalScript, 1000);
                    }
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

    // 获取游戏核心对象
    function getGameCore() {
        const el = document.querySelector(".GamePage_gamePage__ixiPl");
        if (!el) return null;

        const k = Object.keys(el).find(k => k.startsWith("__reactFiber$"));
        if (!k) return null;

        let f = el[k];
        while (f) {
            if (f.stateNode?.sendPing) return f.stateNode;
            f = f.return;
        }
        return null;
    }

    // 初始化游戏核心
    function initGameCore() {
        if (window.AutoBuyAPI.core) return true;

        const core = getGameCore();
        if (core) {
            window.AutoBuyAPI.core = core;
            console.info('%c[MWI-AutoBuyer] 游戏核心对象已获取', 'color: #4CAF50; font-weight: bold;');
            return true;
        }
        return false;
    }

    // 消息处理
    function dispatchMessage(data, direction) {
        if (data.type && window.requestHandlers.has(data.type)) {
            window.requestHandlers.get(data.type).forEach(handler => {
                try { handler(data); } catch { }
            });
        }

        // 缓存市场数据
        if (data.type === 'market_item_order_books_updated') {
            const itemHrid = data.marketItemOrderBooks?.itemHrid;
            if (itemHrid) {
                window.marketDataCache.set(itemHrid, {
                    data: data.marketItemOrderBooks,
                    timestamp: Date.now()
                });
            }
        }
    }

    // 购买处理
    async function processItems(items, delayBetween, processor) {
        const results = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const result = await processor(items[i]);
                results.push({ item: items[i], success: true, result });
            } catch (error) {
                results.push({ item: items[i], success: false, error: error.message });
            }
            if (i < items.length - 1 && delayBetween > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetween));
            }
        }
        return results;
    }

    async function directPurchase(item) {
        const marketData = await getMarketData(item.itemHrid);
        const price = analyzeMarketPrice(marketData, item.quantity);
        return await executePurchase(item.itemHrid, item.quantity, price, true);
    }

    async function bidOrder(item) {
        const marketData = await getMarketData(item.itemHrid);
        const price = analyzeBidPrice(marketData, item.quantity);
        return await executePurchase(item.itemHrid, item.quantity, price, false);
    }

    // 获取市场数据
    async function getMarketData(itemHrid) {
        const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

        // 检查缓存
        const cached = window.marketDataCache.get(fullItemHrid);
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.data;
        }

        if (!window.AutoBuyAPI.core) {
            throw new Error('游戏核心对象未就绪');
        }

        // 等待响应
        const responsePromise = window.AutoBuyAPI.waitForMessage(
            'market_item_order_books_updated',
            8000,
            (responseData) => responseData.marketItemOrderBooks?.itemHrid === fullItemHrid
        );

        // 发送请求
        window.AutoBuyAPI.core.handleGetMarketItemOrderBooks(fullItemHrid);

        const response = await responsePromise;
        return response.marketItemOrderBooks;
    }

    // 执行购买
    async function executePurchase(itemHrid, quantity, price, isInstant) {
        if (!window.AutoBuyAPI.core) {
            throw new Error('游戏核心对象未就绪');
        }

        const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

        if (isInstant) {
            const successPromise = window.AutoBuyAPI.waitForMessage(
                'info',
                15000,
                (responseData) => responseData.message === 'infoNotification.buyOrderCompleted'
            );

            const errorPromise = window.AutoBuyAPI.waitForMessage(
                'error',
                15000
            );

            // 发送购买请求
            window.AutoBuyAPI.core.handlePostMarketOrder(false, fullItemHrid, 0, quantity, price, true);

            try {
                const result = await Promise.race([
                    successPromise,
                    errorPromise.then(errorData => Promise.reject(new Error(errorData.message || '购买失败')))
                ]);
                return result;
            } catch (error) {
                throw error;
            }
        } else {
            // 求购订单
            window.AutoBuyAPI.core.handlePostMarketOrder(false, fullItemHrid, 0, quantity, price, false);
            return { message: '求购订单已提交' };
        }
    }

    // 消息处理器管理
    function registerHandler(type, handler) {
        if (!window.requestHandlers.has(type)) {
            window.requestHandlers.set(type, new Set());
        }
        window.requestHandlers.get(type).add(handler);
    }

    function unregisterHandler(type, handler) {
        const handlers = window.requestHandlers.get(type);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                window.requestHandlers.delete(type);
            }
        }
    }

    // 价格分析
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

        return targetPrice;
    }

    function analyzeBidPrice(marketData) {
        const bids = marketData.orderBooks?.[0]?.bids;
        if (!bids?.length) throw new Error('没有可用的买单');
        return bids[0].price;
    }

    // 注入界面脚本
    function injectLocalScript() {
        if (scriptInjected) return Promise.resolve();

        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.textContent = AUTO_BUY_SCRIPT;
                (document.head || document.documentElement).appendChild(script);
                scriptInjected = true;
                console.info('%c[MWI-AutoBuyer] 界面注入成功', 'color: #4CAF50; font-weight: bold;');
                resolve();
            } catch (error) {
                console.error('%c[MWI-AutoBuyer] 界面注入失败:', 'color: #F44336; font-weight: bold;', error);
                reject(error);
            }
        });
    }

    // 初始化监控
    function setupGameCoreMonitor() {
        const interval = setInterval(() => {
            if (window.AutoBuyAPI.core || initGameCore()) {
                clearInterval(interval);
            }
        }, 2000);
    }

    // 启动
    setupWebSocketInterception();
    setupGameCoreMonitor();
})();