// ==UserScript==
// @name         银河奶牛-自动计算购买材料
// @name:en      MWI-AutoBuyer
// @namespace    http://tampermonkey.net/
// @version      2.0.0
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

    // 脚本注入标志，防止重复注入
    let scriptInjected = false;

    // 内联的自动购买脚本内容
    const AUTO_BUY_SCRIPT = `
(function () {
    'use strict';

    // 配置常量
    const CONFIG = {
        LANG: {
            zh: {
                autoBuyButton: '🛒 自动购买',
                autoBuyButtonActive: '⏳ 购买中...',
                missingPrefix: '缺:',
                missingUnit: '',
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
            },
            en: {
                autoBuyButton: '🛒 Auto Buy',
                autoBuyButtonActive: '⏳ Buying...',
                missingPrefix: 'Need:',
                missingUnit: '',
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
            }
        },
        SELECTORS: {
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
            },
            common: {
                itemContainer: '.Item_itemContainer__x7kH1',
                itemName: '.Item_name__2C42x',
                inventoryItems: '.Inventory_inventory__17CH2 .Item_item__2De2O'
            }
        },
        STYLES: {
            button: {
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
            },
            infoSpan: {
                fontSize: '12px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                minWidth: '60px',
                textAlign: 'center'
            }
        }
    };

    const lang = (navigator.language || 'en').toLowerCase().includes('zh') ? 'zh' : 'en';
    const L = CONFIG.LANG[lang];

    // PostMessage 通信管理器
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
                if (!message || message.type !== 'ws_response') return;

                const pendingRequest = this.pendingRequests.get(message.requestId);
                if (pendingRequest) {
                    this.pendingRequests.delete(message.requestId);
                    clearTimeout(pendingRequest.timeout);

                    if (message.success) {
                        pendingRequest.resolve(message.data);
                    } else {
                        pendingRequest.reject(new Error(message.error || L.requestFailed));
                    }
                }
            });

            // 监听WebSocket就绪消息
            window.addEventListener('message', (event) => {
                if (event.origin !== window.location.origin) return;

                const message = event.data;
                if (message.type === 'ws_ready') {
                    this.checkAPI();
                }
            });
        }

        async sendRequest(action, data = {}, timeout = 30000) {
            const requestId = \`req_\${this.requestIdCounter++}_\${Date.now()}\`;

            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(\`\${L.requestTimeout}: \${action}\`));
                }, timeout);

                this.pendingRequests.set(requestId, {
                    resolve,
                    reject,
                    timeout: timeoutId
                });

                window.postMessage({
                    type: 'ws_request',
                    action: action,
                    data: data,
                    requestId: requestId
                }, window.location.origin);
            });
        }

        async checkAPI() {
            try {
                const result = await this.sendRequest('check_api', {}, 5000);
                return result;
            } catch (error) {
                return { available: false };
            }
        }

        async batchPurchase(items, delayBetween = 800) {
            return await this.sendRequest('batch_purchase', { items, delayBetween });
        }
    }

    // 核心工具类
    class Utils {
        static parseNumber(text) {
            if (!text) return 0;
            const match = text.match(/^([\\d,]+(?:\\.\\d+)?)\\s*([KMB])$/i);
            if (!match) return parseInt(text.replace(/[^\\d]/g, ''), 10) || 0;

            let num = parseFloat(match[1].replace(/,/g, ''));
            const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
            return Math.floor(num * (multipliers[match[2].toUpperCase()] || 1));
        }

        static applyStyles(element, styles) {
            Object.assign(element.style, styles);
        }

        // 从SVG提取物品ID
        static extractItemId(svgElement) {
            if (!svgElement) return null;
            const useElement = svgElement.querySelector('use');
            if (!useElement) return null;
            const href = useElement.getAttribute('href');
            if (!href) return null;
            const match = href.match(/#(.+)$/);
            return match ? match[1] : null;
        }
    }

    // 通知系统
    class Toast {
        constructor() {
            this.container = null;
            this.init();
        }

        init() {
            if (this.container) return;
            this.container = document.createElement('div');
            Utils.applyStyles(this.container, {
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
            Utils.applyStyles(toast, {
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

            setTimeout(() => Utils.applyStyles(toast, { opacity: '1', transform: 'translateY(0)' }), 10);
            setTimeout(() => {
                Utils.applyStyles(toast, { opacity: '0', transform: 'translateY(-20px)' });
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    // 材料需求计算器
    class MaterialCalculator {
        static async getItemQuantity(itemName) {
            const inventoryItems = document.querySelectorAll(CONFIG.SELECTORS.common.inventoryItems);
            const targetItem = Array.from(inventoryItems).find(item => {
                const svg = item.querySelector('svg[aria-label]');
                return svg?.getAttribute('aria-label') === itemName;
            });

            if (!targetItem) return 0;

            const countElement = targetItem.querySelector('.Item_count__1HVvv');
            if (!countElement) return 0;

            const countText = countElement.textContent.trim();

            // 如果是简写格式，需要通过tooltip获取准确数量
            if (/\\d+[KMB]$/i.test(countText)) {
                return new Promise((resolve) => {
                    // 清理现有的tooltip
                    document.querySelectorAll('.ItemTooltipText_itemTooltipText__zFq3A').forEach(tooltip => {
                        if (tooltip.parentElement) tooltip.parentElement.style.display = 'none';
                    });

                    // 触发mouseover事件显示tooltip
                    targetItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

                    const checkTooltip = (attempts = 0) => {
                        const tooltip = document.querySelector('.ItemTooltipText_itemTooltipText__zFq3A');

                        if (tooltip && tooltip.innerText && attempts < 20) {
                            // 尝试多种模式匹配准确数量
                            const patterns = [
                                /数量[：:]\\s*([\\d,]+)/i,           // 中文: 数量: 1,234
                                /Quantity[：:]\\s*([\\d,]+)/i,       // 英文: Quantity: 1,234
                                /(\\d{1,3}(?:,\\d{3})*)/g           // 通用: 匹配所有逗号分隔的数字
                            ];

                            for (const pattern of patterns) {
                                const match = tooltip.innerText.match(pattern);
                                if (match) {
                                    let num;
                                    if (pattern.global) {
                                        // 对于全局匹配，找最大的数字（通常是数量）
                                        num = Math.max(...match.map(m => parseInt(m.replace(/,/g, ''), 10)));
                                    } else {
                                        // 对于具体匹配，取第一个捕获组
                                        num = parseInt(match[1].replace(/,/g, ''), 10);
                                    }

                                    if (num && num > 0) {
                                        // 隐藏tooltip
                                        setTimeout(() => {
                                            if (tooltip.parentElement) {
                                                tooltip.parentElement.style.display = 'none';
                                            }
                                        }, 100);

                                        resolve(num);
                                        return;
                                    }
                                }
                            }
                        }

                        // 如果还没有找到tooltip或解析失败，继续尝试
                        if (attempts < 20) {
                            setTimeout(() => checkTooltip(attempts + 1), 200);
                        } else {
                            // 如果tooltip获取失败，回退到解析简写格式
                            resolve(Utils.parseNumber(countText));
                        }
                    };

                    // 给tooltip一些时间显示
                    setTimeout(checkTooltip, 300);
                });
            }

            return Utils.parseNumber(countText);
        }

        // 新增：从任意元素获取精确数量（用于房屋界面的需求数量）
        static async getExactQuantityFromElement(element) {
            if (!element) return 0;
            
            const countText = element.textContent.trim();
            
            // 如果是简写格式，需要通过tooltip获取准确数量
            if (/\\d+[KMB]$/i.test(countText)) {
                return new Promise((resolve) => {
                    // 清理现有的tooltip
                    document.querySelectorAll('.ItemTooltipText_itemTooltipText__zFq3A').forEach(tooltip => {
                        if (tooltip.parentElement) tooltip.parentElement.style.display = 'none';
                    });

                    // 触发mouseover事件显示tooltip
                    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

                    const checkTooltip = (attempts = 0) => {
                        const tooltip = document.querySelector('.ItemTooltipText_itemTooltipText__zFq3A');

                        if (tooltip && tooltip.innerText && attempts < 20) {
                            // 尝试多种模式匹配准确数量
                            const patterns = [
                                /数量[：:]\\s*([\\d,]+)/i,           // 中文: 数量: 1,234
                                /Amount[：:]\\s*([\\d,]+)/i,       // 英文: Amount: 1,234
                                /(\\d{1,3}(?:,\\d{3})*)/g           // 通用: 匹配所有逗号分隔的数字
                            ];

                            for (const pattern of patterns) {
                                const match = tooltip.innerText.match(pattern);
                                if (match) {
                                    let num;
                                    if (pattern.global) {
                                        // 对于全局匹配，找最大的数字（通常是数量）
                                        num = Math.max(...match.map(m => parseInt(m.replace(/,/g, ''), 10)));
                                    } else {
                                        // 对于具体匹配，取第一个捕获组
                                        num = parseInt(match[1].replace(/,/g, ''), 10);
                                    }

                                    if (num && num > 0) {
                                        // 隐藏tooltip
                                        setTimeout(() => {
                                            if (tooltip.parentElement) {
                                                tooltip.parentElement.style.display = 'none';
                                            }
                                        }, 100);

                                        resolve(num);
                                        return;
                                    }
                                }
                            }
                        }

                        // 如果还没有找到tooltip或解析失败，继续尝试
                        if (attempts < 20) {
                            setTimeout(() => checkTooltip(attempts + 1), 200);
                        } else {
                            // 如果tooltip获取失败，回退到解析简写格式
                            resolve(Utils.parseNumber(countText));
                        }
                    };

                    // 给tooltip一些时间显示
                    setTimeout(checkTooltip, 300);
                });
            }

            return Utils.parseNumber(countText);
        }

        static async calculateRequirements(type) {
            const selectors = CONFIG.SELECTORS[type];
            const container = document.querySelector(selectors.container);
            if (!container) return [];

            const requirements = [];
            let productionQuantity = 1;

            // 获取生产数量（仅生产模式）
            if (type === 'production') {
                const input = document.querySelector(selectors.input);
                productionQuantity = parseInt(input?.value) || 0;
            }

            const requirementsContainer = container.querySelector(selectors.requirements);
            if (!requirementsContainer) return [];

            const materialContainers = requirementsContainer.querySelectorAll(CONFIG.SELECTORS.common.itemContainer);
            const inventoryCounts = requirementsContainer.querySelectorAll(selectors.inventoryCount);
            const inputCounts = requirementsContainer.querySelectorAll(selectors.inputCount);

            for (let i = 0; i < materialContainers.length; i++) {
                const nameElement = materialContainers[i].querySelector(CONFIG.SELECTORS.common.itemName);
                const svgElement = materialContainers[i].querySelector('svg[aria-label]');

                if (!nameElement || !svgElement) continue;

                const materialName = nameElement.textContent.trim();
                const itemId = Utils.extractItemId(svgElement);

                // 使用getItemQuantity方法获取准确库存
                const currentStock = await this.getItemQuantity(materialName);

                let totalNeeded = 0;
                if (type === 'production') {
                    const consumptionMatch = inputCounts[i]?.textContent.match(/\\d+\\.?\\d*/);
                    const consumptionPerUnit = consumptionMatch ? parseFloat(consumptionMatch[0]) : 0;
                    totalNeeded = Math.ceil(productionQuantity * consumptionPerUnit);
                } else {
                    // 房屋模式的逻辑 - 修改部分
                    const neededMatch = inputCounts[i]?.textContent.match(/\\/\\s*([\\d,]+(?:\\.\\d+)?[KMB]?)\\s*/);
                    if (neededMatch) {
                        // 如果匹配到的数字包含KMB，使用精确获取方法
                        if (/[KMB]$/i.test(neededMatch[1])) {
                            totalNeeded = await this.getExactQuantityFromElement(inputCounts[i]);
                        } else {
                            totalNeeded = Utils.parseNumber(neededMatch[1]);
                        }
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
                        console.log(\`%c[MWI-AutoBuyer] \${L.loggerReady}\`, 'color: #4CAF50; font-weight: bold;');
                        this.initObserver();
                        return true;
                    } else if (result.available) {
                        return false;
                    }
                } catch (error) {
                    // 静默处理
                }
                return false;
            };

            if (!(await checkAPI())) {
                console.log(\`[MWI-AutoBuyer] \${L.waitingForLogger}\`);

                // 定期检查API可用性
                const pollAPI = async () => {
                    if (await checkAPI()) return;
                    setTimeout(pollAPI, 2000);
                };

                setTimeout(pollAPI, 3000);
            }
        }

        createButton(onClick) {
            const btn = document.createElement("button");
            btn.textContent = L.autoBuyButton;
            Utils.applyStyles(btn, CONFIG.STYLES.button);

            // 悬停效果 - 使用原游戏的hover颜色
            btn.addEventListener("mouseenter", () => {
                Utils.applyStyles(btn, {
                    backgroundColor: "var(--color-primary-hover)"
                });
            });
            btn.addEventListener("mouseleave", () => {
                Utils.applyStyles(btn, {
                    backgroundColor: "var(--color-primary)"
                });
            });

            btn.addEventListener("click", async () => {
                if (!this.loggerReady) {
                    console.error(\`\${L.wsNotAvailable}\`);
                    return;
                }

                btn.disabled = true;
                btn.textContent = L.autoBuyButtonActive;
                Utils.applyStyles(btn, {
                    backgroundColor: "var(--color-disabled)",
                    cursor: "not-allowed"
                });
                
                try {
                    await onClick();
                } catch (error) {
                    this.toast.show(\`\${L.purchaseError}: \${error.message}\`, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = L.autoBuyButton;
                    Utils.applyStyles(btn, {
                        backgroundColor: "var(--color-primary)",
                        cursor: "pointer"
                    });
                }
            });

            return btn;
        }

        createInfoSpan() {
            const span = document.createElement("span");
            span.textContent = \`\${L.missingPrefix}0\${L.missingUnit}\`;
            Utils.applyStyles(span, CONFIG.STYLES.infoSpan);
            return span;
        }

        async updateInfoSpans(type) {
            const requirements = await MaterialCalculator.calculateRequirements(type);
            const className = type === 'production' ? 'material-info-span' : 'house-material-info-span';
            const spans = document.querySelectorAll(\`.\${className}\`);

            spans.forEach((span, index) => {
                if (requirements[index]) {
                    const needed = requirements[index].supplementNeeded;
                    span.textContent = \`\${L.missingPrefix}\${needed}\${L.missingUnit}\`;
                    span.style.color = needed > 0 ? '#ff6b6b' : 'var(--color-text-dark-mode)';
                }
            });
        }

        async purchaseFlow(type) {
            if (!this.loggerReady) {
                this.toast.show(L.wsNotAvailable, 'error');
                return;
            }

            const requirements = await MaterialCalculator.calculateRequirements(type);
            const needToBuy = requirements.filter(item => item.supplementNeeded > 0 && item.itemId);

            if (needToBuy.length === 0) {
                this.toast.show(L.noMaterialsNeeded, 'info');
                return;
            }

            const itemList = needToBuy.map(item =>
                \`\${item.materialName}: \${item.supplementNeeded}\${L.each}\`
            ).join(', ');

            this.toast.show(\`\${L.startPurchasing} \${needToBuy.length} \${L.materials}: \${itemList}\`, 'info');

            try {
                // 转换为批量购买格式
                const purchaseItems = needToBuy.map(item => ({
                    itemHrid: item.itemId,
                    quantity: item.supplementNeeded,
                    materialName: item.materialName
                }));

                // 通过PostMessage调用批量购买
                const results = await this.postMessageAPI.batchPurchase(purchaseItems, 800);

                // 显示购买结果
                let successCount = 0;
                let totalCost = 0;

                results.forEach(result => {
                    if (result.success) {
                        successCount++;
                        const cost = result.priceAnalysis?.totalCost || 0;
                        totalCost += cost;

                        this.toast.show(
                            \`\${L.purchased} \${result.item.materialName || result.item.itemHrid} x\${result.item.quantity} (\${cost}\${L.coins})\`,
                            'success'
                        );
                    } else {
                        this.toast.show(
                            \`\${L.purchaseFailed} \${result.item.materialName || result.item.itemHrid}: \${result.error}\`,
                            'error'
                        );
                    }
                });

                // 显示总结
                if (successCount > 0) {
                    this.toast.show(
                        \`\${L.purchaseComplete} \${L.purchaseSuccess} \${successCount}/\${needToBuy.length} \${L.materials}，\${L.totalCost} \${totalCost} \${L.coins}\`,
                        'success',
                        5000
                    );

                    // 更新UI显示
                    setTimeout(() => this.updateInfoSpans(type), 2000);
                } else {
                    this.toast.show(L.allPurchasesFailed, 'error');
                }

            } catch (error) {
                this.toast.show(\`\${L.purchaseError}: \${error.message}\`, 'error');
            }
        }

        initObserver() {
            if (this.observer) return; // 避免重复初始化

            this.observer = new MutationObserver(() => {
                this.setupProductionUI();
                this.setupHouseUI();
            });

            this.observer.observe(document.body, { childList: true, subtree: true });

            // 监听输入变化
            document.addEventListener('input', (e) => {
                if (e.target.classList.contains('Input_input__2-t98')) {
                    setTimeout(() => this.updateInfoSpans('production'), 100);
                }
            });

            // 立即设置UI
            this.setupProductionUI();
            this.setupHouseUI();
        }

        setupProductionUI() {
            document.querySelectorAll(CONFIG.SELECTORS.production.container).forEach(panel => {
                if (panel.dataset.buttonInserted) return;

                const requirements = panel.querySelector(CONFIG.SELECTORS.production.requirements);
                if (!requirements) return;

                panel.dataset.buttonInserted = "true";

                // 设置网格布局 - 保持原有设计
                if (!requirements.dataset.modified) {
                    requirements.dataset.modified = "true";
                    requirements.style.gridTemplateColumns = "auto min-content auto auto";

                    // 添加信息显示 - 保持原有位置和样式
                    requirements.querySelectorAll(CONFIG.SELECTORS.common.itemContainer).forEach(item => {
                        if (item.nextSibling?.classList?.contains('material-info-span')) return;
                        const span = this.createInfoSpan();
                        span.className = 'material-info-span';
                        item.parentNode.insertBefore(span, item.nextSibling);
                    });

                    setTimeout(() => this.updateInfoSpans('production'), 100);
                }

                // 添加购买按钮 - 保持原有位置
                const nameDiv = panel.querySelector(CONFIG.SELECTORS.production.nameDiv);
                if (nameDiv && !nameDiv.nextSibling?.textContent?.includes('🛒')) {
                    const btn = this.createButton(() => this.purchaseFlow('production'));
                    btn.style.marginLeft = '10px';
                    nameDiv.parentNode.insertBefore(btn, nameDiv.nextSibling);
                }
            });
        }

        setupHouseUI() {
            document.querySelectorAll(CONFIG.SELECTORS.house.container).forEach(panel => {
                if (panel.dataset.autoBuyButtonInserted) return;

                const requirements = panel.querySelector(CONFIG.SELECTORS.house.requirements);
                if (!requirements) return;

                panel.dataset.autoBuyButtonInserted = "true";

                // 设置网格布局和信息显示 - 保持原有设计
                if (!requirements.dataset.houseModified) {
                    requirements.dataset.houseModified = "true";
                    requirements.style.gridTemplateColumns = "auto auto auto 120px";

                    requirements.querySelectorAll(CONFIG.SELECTORS.common.itemContainer).forEach(item => {
                        if (item.nextSibling?.classList?.contains('house-material-info-span')) return;
                        const span = this.createInfoSpan();
                        span.className = 'house-material-info-span';
                        item.parentNode.insertBefore(span, item.nextSibling);
                    });

                    setTimeout(() => this.updateInfoSpans('house'), 100);
                }

                // 添加购买按钮 - 保持原有位置
                const headerDiv = panel.querySelector(CONFIG.SELECTORS.house.headerDiv);
                if (headerDiv) {
                    const btn = this.createButton(() => this.purchaseFlow('house'));
                    btn.style.marginBottom = '10px';
                    btn.style.display = 'block';
                    btn.style.width = 'fit-content';
                    headerDiv.parentNode.insertBefore(btn, headerDiv);
                }
            });
        }
    }

    // 初始化应用
    const app = new UIManager();

    // 定期清理tooltip - 修复版本，更加谨慎
    setInterval(() => {
        document.querySelectorAll('.ItemTooltipText_itemTooltipText__zFq3A').forEach(tooltip => {
            // 只隐藏没有mouseover事件的tooltip
            if (tooltip.parentElement && !tooltip.parentElement.matches(':hover')) {
                tooltip.parentElement.style.display = 'none';
            }
        });
    }, 5000);

})();
    `;

    // 本地注入脚本的函数
    function injectLocalScript() {
        if (scriptInjected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                // 创建script元素并直接插入代码
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.textContent = AUTO_BUY_SCRIPT;

                // 添加到头部
                (document.head || document.documentElement).appendChild(script);

                scriptInjected = true;
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    // 全局 WebSocket 实例存储
    window.wsInstances = [];
    window.currentWS = null;

    // 消息监听器和处理器
    window.wsMessageListeners = new Set();
    window.wsRequestHandlers = new Map();

    // 购买相关的消息队列
    window.wsPurchaseQueue = [];
    window.wsMarketDataCache = new Map();

    // PostMessage 通信处理器
    function setupPostMessageAPI() {
        window.addEventListener('message', async (event) => {
            // 只处理来自同源的消息
            if (event.origin !== window.location.origin) return;

            const message = event.data;
            if (!message || message.type !== 'ws_request') return;

            try {
                let result;
                switch (message.action) {
                    case 'check_api':
                        result = { available: true, ws_ready: !!window.currentWS };
                        break;

                    case 'get_market_data':
                        result = await handleGetMarketData(message.data);
                        break;

                    case 'smart_purchase':
                        result = await handleSmartPurchase(message.data);
                        break;

                    case 'batch_purchase':
                        result = await handleBatchPurchase(message.data);
                        break;

                    default:
                        throw new Error(`未知的操作: ${message.action}`);
                }

                // 发送成功响应
                window.postMessage({
                    type: 'ws_response',
                    action: message.action,
                    success: true,
                    data: result,
                    requestId: message.requestId
                }, window.location.origin);

            } catch (error) {
                // 发送错误响应
                window.postMessage({
                    type: 'ws_response',
                    action: message.action,
                    success: false,
                    error: error.message,
                    requestId: message.requestId
                }, window.location.origin);
            }
        });
    }

    // 处理获取市场数据请求
    async function handleGetMarketData({ itemHrid, useCache = true }) {
        const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

        // 检查缓存
        if (useCache && window.wsMarketDataCache.has(fullItemHrid)) {
            const cached = window.wsMarketDataCache.get(fullItemHrid);
            if (Date.now() - cached.timestamp < 60000) { // 1分钟缓存
                return cached.data;
            }
        }

        const requestData = {
            type: "get_market_item_order_books",
            getMarketItemOrderBooksData: {
                itemHrid: fullItemHrid
            }
        };

        return new Promise((resolve, reject) => {
            if (!window.currentWS || window.currentWS.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket连接不可用'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('获取市场数据超时'));
            }, 8000);

            const responseHandler = (responseData) => {
                if (responseData.type === 'market_item_order_books_updated' &&
                    responseData.marketItemOrderBooks?.itemHrid === fullItemHrid) {
                    clearTimeout(timeout);
                    cleanup();
                    resolve(responseData.marketItemOrderBooks);
                }
            };

            const cleanup = () => {
                if (window.wsRequestHandlers.has('market_item_order_books_updated')) {
                    const handlers = window.wsRequestHandlers.get('market_item_order_books_updated');
                    handlers.delete(responseHandler);
                    if (handlers.size === 0) {
                        window.wsRequestHandlers.delete('market_item_order_books_updated');
                    }
                }
            };

            // 注册响应处理器
            if (!window.wsRequestHandlers.has('market_item_order_books_updated')) {
                window.wsRequestHandlers.set('market_item_order_books_updated', new Set());
            }
            window.wsRequestHandlers.get('market_item_order_books_updated').add(responseHandler);

            // 发送请求
            window.currentWS.send(JSON.stringify(requestData));
        });
    }

    // 处理智能购买请求
    async function handleSmartPurchase({ itemHrid, quantity }) {
        // 获取市场数据
        const marketData = await handleGetMarketData({ itemHrid });

        // 分析价格
        const priceAnalysis = analyzeMarketPrice(marketData, quantity);

        // 执行购买
        const result = await executePurchase(itemHrid, quantity, priceAnalysis.maxPrice);

        return {
            success: true,
            result: result,
            priceAnalysis: priceAnalysis
        };
    }

    // 处理批量购买请求
    async function handleBatchPurchase({ items, delayBetween = 800 }) {
        const results = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            try {
                const result = await handleSmartPurchase({
                    itemHrid: item.itemHrid,
                    quantity: item.quantity
                });
                results.push({ item, ...result });

                // 延迟避免过于频繁的请求
                if (i < items.length - 1 && delayBetween > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBetween));
                }
            } catch (error) {
                results.push({
                    item,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    // 执行购买操作
    async function executePurchase(itemHrid, quantity, price, enhancementLevel = 0) {
        const fullItemHrid = itemHrid.startsWith('/items/') ? itemHrid : `/items/${itemHrid}`;

        const requestData = {
            type: "post_market_order",
            postMarketOrderData: {
                isSell: false,
                itemHrid: fullItemHrid,
                enhancementLevel: enhancementLevel,
                quantity: quantity,
                price: price,
                isInstantOrder: true
            }
        };

        return new Promise((resolve, reject) => {
            if (!window.currentWS || window.currentWS.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket连接不可用'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('购买超时'));
            }, 15000);

            window.currentWS.send(JSON.stringify(requestData));

            // 等待购买完成或错误
            const checkResult = () => {
                const recent = window.wsPurchaseQueue.filter(item =>
                    Date.now() - item.timestamp < 15000
                );

                const completed = recent.find(item => item.type === 'purchase_completed');
                const error = recent.find(item => item.type === 'error');

                if (completed) {
                    clearTimeout(timeout);
                    resolve(completed.data);
                    return;
                }

                if (error) {
                    clearTimeout(timeout);
                    reject(new Error(error.data.message || '购买失败'));
                    return;
                }

                setTimeout(checkResult, 200);
            };

            checkResult();
        });
    }

    // 分析市场价格
    function analyzeMarketPrice(marketData, neededQuantity) {
        if (!marketData.orderBooks || !marketData.orderBooks[0] || !marketData.orderBooks[0].asks) {
            throw new Error('无效的市场数据结构');
        }

        const asks = marketData.orderBooks[0].asks;
        if (asks.length === 0) {
            throw new Error('没有可用的卖单');
        }

        let cumulativeQuantity = 0;
        let targetPrice = 0;
        let totalCost = 0;
        let priceBreakdown = [];

        for (const ask of asks) {
            const availableFromThisOrder = Math.min(ask.quantity, neededQuantity - cumulativeQuantity);

            cumulativeQuantity += availableFromThisOrder;
            targetPrice = ask.price; // 最高价格
            totalCost += availableFromThisOrder * ask.price;

            priceBreakdown.push({
                price: ask.price,
                quantity: availableFromThisOrder,
                cost: availableFromThisOrder * ask.price
            });

            if (cumulativeQuantity >= neededQuantity) {
                break;
            }
        }

        if (cumulativeQuantity < neededQuantity) {
            throw new Error(`市场库存不足。可用: ${cumulativeQuantity}, 需要: ${neededQuantity}`);
        }

        return {
            maxPrice: targetPrice,
            averagePrice: Math.ceil(totalCost / neededQuantity),
            totalCost: totalCost,
            availableQuantity: cumulativeQuantity,
            priceBreakdown: priceBreakdown
        };
    }

    // 消息分发器
    function dispatchMessage(data, direction) {
        // 通知所有监听器
        window.wsMessageListeners.forEach(listener => {
            try {
                listener(data, direction);
            } catch (e) {
                // 静默错误
            }
        });

        // 处理特定的请求响应
        if (data.type && window.wsRequestHandlers.has(data.type)) {
            const handlers = window.wsRequestHandlers.get(data.type);
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    // 静默错误
                }
            });
        }

        // 缓存市场数据
        if (data.type === 'market_item_order_books_updated') {
            const itemHrid = data.marketItemOrderBooks?.itemHrid;
            if (itemHrid) {
                window.wsMarketDataCache.set(itemHrid, {
                    data: data.marketItemOrderBooks,
                    timestamp: Date.now()
                });
                // 清理过期缓存 (5分钟)
                setTimeout(() => {
                    if (window.wsMarketDataCache.has(itemHrid)) {
                        const cached = window.wsMarketDataCache.get(itemHrid);
                        if (Date.now() - cached.timestamp > 300000) {
                            window.wsMarketDataCache.delete(itemHrid);
                        }
                    }
                }, 300000);
            }
        }

        // 处理购买完成消息
        if (data.type === 'info' && data.message === 'infoNotification.buyOrderCompleted') {
            window.wsPurchaseQueue.push({
                type: 'purchase_completed',
                data: data,
                timestamp: Date.now()
            });
        }

        // 处理错误消息
        if (data.type === 'error') {
            window.wsPurchaseQueue.push({
                type: 'error',
                data: data,
                timestamp: Date.now()
            });
        }
    }

    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
            const ws = new target(...args);
            const url = args[0];

            // 保存到全局变量
            window.wsInstances.push(ws);
            window.currentWS = ws; // 最新的连接

            // 拦截 .send()
            const originalSend = ws.send;
            ws.send = function (data) {
                try {
                    const parsed = JSON.parse(data);
                    // 分发消息
                    dispatchMessage(parsed, 'send');
                } catch (e) {
                    // 静默处理非JSON数据
                }
                return originalSend.call(this, data);
            };

            // 拦截 .onmessage
            ws.addEventListener("message", function (event) {
                try {
                    const parsed = JSON.parse(event.data);
                    // 分发消息
                    dispatchMessage(parsed, 'receive');
                } catch (e) {
                    // 静默处理非JSON数据
                }
            });

            ws.addEventListener("open", function () {
                // 在第一个WebSocket连接建立后注入本地脚本
                if (window.wsInstances.length === 1 && !scriptInjected) {
                    // 延迟一小段时间确保WebSocket完全就绪
                    setTimeout(async () => {
                        try {
                            await injectLocalScript();
                            console.info('%c[MWI-AutoBuyer] 界面注入成功', 'color: #4CAF50; font-weight: bold;');
                        } catch (error) {
                            console.error('%c[MWI-AutoBuyer] 界面注入失败:', 'color: #F44336; font-weight: bold;', error);
                        }
                    }, 1000);
                }

                // 通知其他脚本WebSocket已就绪
                window.postMessage({
                    type: 'ws_ready',
                    detail: { ws, url }
                }, window.location.origin);
            });

            ws.addEventListener("close", function (e) {
                // 从数组中移除关闭的连接
                const index = window.wsInstances.indexOf(ws);
                if (index > -1) {
                    window.wsInstances.splice(index, 1);
                }
                if (window.currentWS === ws) {
                    window.currentWS = window.wsInstances[window.wsInstances.length - 1] || null;
                }
            });

            ws.addEventListener("error", function (e) {
                // 静默处理错误
            });

            return ws;
        }
    });

    // 清理缓存
    window.clearWSCache = function() {
        window.wsMarketDataCache.clear();
        window.wsPurchaseQueue.length = 0;
        return true;
    };

    // 初始化PostMessage API
    setupPostMessageAPI();

})();