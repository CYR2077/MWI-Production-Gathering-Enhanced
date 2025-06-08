// ==UserScript==
// @name         MWI-AutoBuyer
// @name:zh-CN   银河奶牛-自动购买材料
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically purchase materials in MilkyWayIdle. Shows required material quantities in queue interface and provides one-click purchase functionality.
// @description:zh-CN  在添加队列界面显示需要的材料数量，添加一键购买功能
// @author       XIxixi297
// @license      GPL3
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=milkywayidle.com
// @grant        GM_addStyle
// ==/UserScript==

/**
 * 关于使用本插件可能存在的脚本行为说明：
 *
 * 《游戏规则》
 *
 * 4.机器人、脚本和扩展
 *
 *  4.1禁止机器人: 请勿使用任何自动化程序代替你操作游戏。
 *  4.2脚本和扩展: 任何脚本或扩展程序都不得为玩家执行任何操作(向服务器发送任何请求)， 仅限使用于显示信息或改进用户界面 (例如: 显示战斗摘要、跟踪掉落、将按钮移动到不同位置)。
 *
 * 请仔细阅读游戏规则条款后，再选择是否安装使用本插件，谢谢！
 */

(function () {
    'use strict';

    // 语言配置
    const LANG = {
        zh: {
            autoBuyButton: '🛒 自动购买缺少的材料',
            autoBuyButtonActive: '⏳ 购买中...',
            missingPrefix: '还差:',
            missingUnit: '个',
            noMaterialsNeeded: '所有材料都充足，无需购买！',
            cannotEnterMarket: '无法进入市场！',
            materialsNotFoundInMarket: '在市场中未找到需要的材料！',
            startPurchasing: '开始购买',
            itemsColon: '种物品: ',
            purchased: '已购买',
            purchaseFailed: '购买失败',
            purchaseComplete: '购买完成！',
            purchaseError: '购买过程中出现错误，请检查控制台',
            viewAllItems: '查看所有物品'
        },
        en: {
            autoBuyButton: '🛒 Auto Buy Needed Materials',
            autoBuyButtonActive: '⏳ Purchasing...',
            missingPrefix: 'Need:',
            missingUnit: '',
            noMaterialsNeeded: 'All materials are sufficient, no purchase needed!',
            cannotEnterMarket: 'Cannot enter marketplace!',
            materialsNotFoundInMarket: 'Required materials not found in marketplace!',
            startPurchasing: 'Start purchasing',
            itemsColon: ' items: ',
            purchased: 'Purchased',
            purchaseFailed: 'Purchase failed for',
            purchaseComplete: 'Purchase completed!',
            purchaseError: 'Error occurred during purchase, please check console',
            viewAllItems: 'View All Items'
        }
    };

    // 获取当前语言
    const currentLang = (navigator.language || 'en').toLowerCase().includes('zh') ? 'zh' : 'en';
    const L = LANG[currentLang];

    // 工具函数
    const utils = {
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        
        parseKMB: (text) => {
            const match = text.match(/^([\d,]+(?:\.\d+)?)\s*([KMB])$/i);
            if (!match) return parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
            
            let num = parseFloat(match[1].replace(/,/g, ''));
            const unit = match[2].toUpperCase();
            const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
            return Math.floor(num * (multipliers[unit] || 1));
        },

        getElements: {
            productionInput: () => document.querySelector(".Input_input__2-t98"),
            itemRequirements: () => document.querySelector(".SkillActionDetail_itemRequirements__3SPnA"),
            marketItems: () => document.querySelectorAll('.MarketplacePanel_marketItems__D4k7e .Item_item__2De2O.Item_clickable__3viV6'),
            inventoryItems: () => document.querySelectorAll('.Inventory_inventory__17CH2 .Item_item__2De2O')
        }
    };

    // 通知系统
    const toast = {
        container: null,
        
        init() {
            if (this.container) return;
            this.container = document.createElement('div');
            Object.assign(this.container.style, {
                position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                zIndex: '10000', pointerEvents: 'none'
            });
            document.body.appendChild(this.container);
        },

        show(message, type = 'info', duration = 3000) {
            this.init();
            const toastEl = document.createElement('div');
            toastEl.textContent = message;
            
            const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#F44336' };
            Object.assign(toastEl.style, {
                background: colors[type], color: 'white', padding: '12px 24px',
                borderRadius: '6px', marginBottom: '10px', fontSize: '14px',
                fontWeight: '500', opacity: '0', transform: 'translateY(-20px)',
                transition: 'all 0.3s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            });

            this.container.appendChild(toastEl);
            
            setTimeout(() => Object.assign(toastEl.style, { opacity: '1', transform: 'translateY(0)' }), 10);
            setTimeout(() => {
                Object.assign(toastEl.style, { opacity: '0', transform: 'translateY(-20px)' });
                setTimeout(() => toastEl.remove(), 300);
            }, duration);
        }
    };

    // 获取物品数量（支持K/M/B格式）
    async function getItemQuantity(itemName) {
        const inventoryItems = utils.getElements.inventoryItems();
        const targetItem = Array.from(inventoryItems).find(item => {
            const svg = item.querySelector('svg[aria-label]');
            return svg && svg.getAttribute('aria-label') === itemName;
        });

        if (!targetItem) return 0;

        const countElement = targetItem.querySelector('.Item_count__1HVvv');
        if (!countElement) return 0;

        const countText = countElement.textContent.trim();
        
        // 如果是K/M/B格式，通过悬停获取精确数量
        if (/\d+[KMB]$/i.test(countText)) {
            return new Promise((resolve) => {
                targetItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
                
                const checkTooltip = (attempts = 0) => {
                    const tooltip = document.querySelector('.ItemTooltipText_itemTooltipText__zFq3A');
                    if (tooltip && attempts < 20) {
                        const patterns = [/数量[：:]\s*([\d,]+)/i, /Quantity[：:]\s*([\d,]+)/i, /(\d{1,3}(?:,\d{3})*)/g];
                        for (const pattern of patterns) {
                            const match = tooltip.innerText.match(pattern);
                            if (match) {
                                const num = pattern.global 
                                    ? Math.max(...match.map(m => parseInt(m.replace(/,/g, ''), 10)))
                                    : parseInt(match[1].replace(/,/g, ''), 10);
                                resolve(num || 0);
                                return;
                            }
                        }
                    }
                    if (attempts < 20) setTimeout(() => checkTooltip(attempts + 1), 200);
                    else resolve(utils.parseKMB(countText));
                };
                
                setTimeout(checkTooltip, 300);
            });
        }

        return utils.parseKMB(countText);
    }

    // 计算材料需求
    async function calculateMaterialRequirements() {
        const productionInput = utils.getElements.productionInput();
        const itemRequirements = utils.getElements.itemRequirements();
        
        if (!productionInput || !itemRequirements) return [];

        const productionQuantity = parseInt(productionInput.value) || 0;
        const materialNames = itemRequirements.querySelectorAll(".Item_name__2C42x");
        const inputCounts = itemRequirements.querySelectorAll(".SkillActionDetail_inputCount__1rdrn");

        const requirements = [];
        for (let i = 0; i < materialNames.length; i++) {
            const materialName = materialNames[i].textContent.trim();
            const currentStock = await getItemQuantity(materialName);
            
            const consumptionMatch = inputCounts[i].textContent.match(/\d+\.?\d*/);
            const consumptionPerUnit = consumptionMatch ? parseFloat(consumptionMatch[0]) : 0;
            
            const totalNeeded = Math.ceil(productionQuantity * consumptionPerUnit);
            const supplementNeeded = Math.max(0, totalNeeded - currentStock);

            requirements.push({
                materialName, supplementNeeded, consumptionPerUnit,
                totalNeeded, currentStock, index: i
            });
        }

        return requirements;
    }

    // 更新材料显示
    async function updateMaterialDisplays() {
        const requirements = await calculateMaterialRequirements();
        const infoSpans = document.querySelectorAll('.material-info-span');
        
        infoSpans.forEach((span, index) => {
            if (requirements[index]) {
                const needed = requirements[index].supplementNeeded;
                span.textContent = `${L.missingPrefix}${needed}${L.missingUnit}`;
                span.style.color = needed > 0 ? '#ff6b6b' : '#51cf66';
            }
        });
    }

    // 市场操作 - 使用原始版本的购买逻辑
    const market = {
        enter() {
            try {
                const marketButton = document.getElementsByClassName("NavigationBar_nav__3uuUl")[1];
                if (marketButton) {
                    marketButton.click();

                    setTimeout(() => {
                        try {
                            const buttons = document.getElementsByClassName("Button_button__1Fe9z");
                            let viewAllButton = null;

                            // 查找当前语言的"查看所有物品"按钮
                            for (let button of buttons) {
                                const buttonText = button.textContent.trim();
                                if (buttonText === "查看所有物品" || buttonText === "View All Items") {
                                    viewAllButton = button;
                                    break;
                                }
                            }

                            if (viewAllButton) {
                                viewAllButton.click();
                            } else {
                                // 备用选项卡按钮
                                const tabButton = document.getElementsByClassName("MuiBadge-root TabsComponent_badge__1Du26 css-1rzb3uu")[2];
                                if (tabButton) {
                                    tabButton.click();
                                }
                            }
                        } catch (error) {
                            console.error('进入市场失败:', error);
                        }
                    }, 500);

                    return true;
                } else {
                    return false;
                }
            } catch (error) {
                console.error('进入市场时出错:', error);
                return false;
            }
        },

        findItems(materialRequirements) {
            try {
                const marketPanel = document.querySelector('.MarketplacePanel_marketItems__D4k7e');
                if (!marketPanel) return [];

                const marketItems = marketPanel.querySelectorAll('.Item_item__2De2O.Item_clickable__3viV6');
                const marketItemsMap = new Map();
                marketItems.forEach(item => {
                    const svg = item.querySelector('svg[aria-label]');
                    if (svg) {
                        const label = svg.getAttribute('aria-label');
                        if (label) {
                            marketItemsMap.set(label, item);
                        }
                    }
                });

                const foundItems = [];
                materialRequirements.forEach(requirement => {
                    if (requirement.supplementNeeded > 0) {
                        const marketItemElement = marketItemsMap.get(requirement.materialName);

                        if (marketItemElement) {
                            foundItems.push({
                                materialName: requirement.materialName,
                                supplementNeeded: requirement.supplementNeeded,
                                marketElement: marketItemElement,
                                consumptionPerUnit: requirement.consumptionPerUnit,
                                totalNeeded: requirement.totalNeeded,
                                currentStock: requirement.currentStock
                            });
                        }
                    }
                });

                return foundItems;

            } catch (error) {
                console.error('在市场中查找所需物品时出错:', error);
                return [];
            }
        },

        async purchaseItem(item) {
            return new Promise(async (resolve, reject) => {
                try {
                    if (!item.marketElement) {
                        throw new Error(`无法找到 ${item.materialName} 的可点击元素`);
                    }

                    // 点击市场中的物品
                    item.marketElement.click();
                    await utils.sleep(800);

                    // 查找并点击操作按钮
                    const actionButton = document.getElementsByClassName("MarketplacePanel_actionButtonText__3xIfd")[0];
                    if (!actionButton) {
                        throw new Error('未找到购买菜单按钮');
                    }

                    actionButton.click();
                    await utils.sleep(500);

                    // 查找数量输入字段
                    const quantityInput = document.getElementsByClassName("Input_input__2-t98")[1];
                    if (!quantityInput) {
                        throw new Error('未找到数量输入字段');
                    }

                    // 以编程方式设置数量值
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(quantityInput, item.supplementNeeded.toString());

                    const inputEvent = new Event('input', { bubbles: true });
                    quantityInput.dispatchEvent(inputEvent);

                    await utils.sleep(500);
                    await this.adjustPrice(item.supplementNeeded);

                    // 查找并点击购买按钮
                    const buyButton = document.getElementsByClassName("Button_button__1Fe9z Button_success__6d6kU")[1];
                    if (!buyButton) {
                        throw new Error('未找到购买按钮');
                    }

                    buyButton.click();
                    await utils.sleep(1500);
                    await this.returnToView();

                    await utils.sleep(1000);

                    resolve();

                } catch (error) {
                    reject(error);
                }
            });
        },

        async adjustPrice(neededQuantity) {
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                try {
                    const quantityLabel = document.getElementsByClassName("MarketplacePanel_label__3bxRh")[1];
                    if (!quantityLabel) break;

                    const quantityText = quantityLabel.textContent;
                    const availableQuantity = this.parseQuantityFromText(quantityText);

                    if (availableQuantity >= neededQuantity) {
                        break;
                    }

                    const plusButton = this.findPlusButton();
                    if (!plusButton) break;

                    plusButton.click();
                    attempts++;
                    await utils.sleep(500);

                } catch (error) {
                    console.error('调整价格时出错:', error);
                    break;
                }
            }
        },

        parseQuantityFromText(text) {
            const match = text.match(/(\d+(?:\.\d+)?)\s*([KMB]?)/i);
            if (!match) return 0;

            let quantity = parseFloat(match[1]);
            const unit = match[2].toUpperCase();

            switch (unit) {
                case 'K':
                    quantity *= 1000;
                    break;
                case 'M':
                    quantity *= 1e6;
                    break;
                case 'B':
                    quantity *= 1e9;
                    break;
            }

            return Math.floor(quantity);
        },

        findPlusButton() {
            const buttons = document.querySelectorAll('button');
            for (let button of buttons) {
                if (button.textContent.trim() === '+') {
                    return button;
                }
            }
            return null;
        },

        async returnToView() {
            try {
                const buttons = document.getElementsByClassName("Button_button__1Fe9z");
                let viewAllButton = null;

                // 查找"查看所有物品"按钮
                for (let button of buttons) {
                    const buttonText = button.textContent.trim();
                    if (buttonText === "查看所有物品" || buttonText === "View All Items") {
                        viewAllButton = button;
                        break;
                    }
                }

                if (viewAllButton) {
                    viewAllButton.click();
                    await utils.sleep(1200);
                }

            } catch (error) {
                console.error('返回市场失败:', error);
            }
        }
    };

    // 完整购买流程
    async function completePurchaseProcess() {
        const requirements = await calculateMaterialRequirements();
        const needToBuy = requirements.filter(item => item.supplementNeeded > 0);

        if (needToBuy.length === 0) {
            toast.show(L.noMaterialsNeeded, 'info');
            return;
        }

        if (!market.enter()) {
            toast.show(L.cannotEnterMarket, 'error');
            return;
        }

        setTimeout(async () => {
            const foundItems = market.findItems(requirements);
            
            if (foundItems.length === 0) {
                toast.show(L.materialsNotFoundInMarket, 'warning');
                return;
            }

            const itemList = foundItems.map(item => 
                `${item.materialName}: ${item.supplementNeeded}${currentLang === 'zh' ? '个' : ''}`
            ).join(', ');
            toast.show(`${L.startPurchasing} ${foundItems.length}${L.itemsColon}${itemList}`, 'info');

            // 使用原始版本的购买逻辑
            for (let i = 0; i < foundItems.length; i++) {
                const item = foundItems[i];

                try {
                    await market.purchaseItem(item);
                    toast.show(`${L.purchased} ${item.materialName} x${item.supplementNeeded}`, 'success');
                } catch (error) {
                    console.error(`购买 ${item.materialName} 失败:`, error);
                    toast.show(`${L.purchaseFailed} ${item.materialName}`, 'error');
                    try {
                        await market.returnToView();
                        await utils.sleep(1000);
                    } catch (returnError) {
                        console.error('返回市场失败:', returnError);
                    }
                }

                await utils.sleep(1000);
            }

            setTimeout(updateMaterialDisplays, 1000);
            toast.show(L.purchaseComplete, 'success');
        }, 1000);
    }

    // UI 观察器和事件绑定
    let isCalculationInterfaceOpen = false;
    const hoveredElements = new Set();

    const observer = new MutationObserver(() => {
        // 检查界面状态
        const itemRequirements = utils.getElements.itemRequirements();
        const isOpen = !!itemRequirements;
        
        if (isOpen !== isCalculationInterfaceOpen) {
            isCalculationInterfaceOpen = isOpen;
            if (!isOpen) {
                // 清理悬停元素
                hoveredElements.forEach(el => el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
                hoveredElements.clear();
            }
        }

        // 处理材料需求显示
        document.querySelectorAll(".SkillActionDetail_itemRequirements__3SPnA").forEach(req => {
            if (req.dataset.modified) return;
            req.dataset.modified = "true";
            req.style.gridTemplateColumns = "auto min-content auto auto";

            req.querySelectorAll(".Item_itemContainer__x7kH1").forEach(item => {
                if (item.nextSibling?.classList?.contains('material-info-span')) return;

                const infoSpan = document.createElement("span");
                infoSpan.textContent = `${L.missingPrefix}0${L.missingUnit}`;
                infoSpan.className = 'material-info-span';
                Object.assign(infoSpan.style, {
                    fontSize: '12px', fontWeight: 'bold', padding: '2px 4px', borderRadius: '3px'
                });
                item.parentNode.insertBefore(infoSpan, item.nextSibling);
            });

            setTimeout(updateMaterialDisplays, 100);
        });

        // 添加自动购买按钮
        document.querySelectorAll(".SkillActionDetail_regularComponent__3oCgr").forEach(panel => {
            if (panel.dataset.buttonInserted) return;
            panel.dataset.buttonInserted = "true";

            const nameDiv = panel.querySelector(".SkillActionDetail_name__3erHV");
            if (!nameDiv) return;

            const btn = document.createElement("button");
            btn.textContent = L.autoBuyButton;
            Object.assign(btn.style, {
                marginLeft: '10px', padding: '4px 12px', 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 'bold', transition: 'all 0.3s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            });

            // 悬停效果
            btn.addEventListener("mouseenter", () => {
                btn.style.transform = "translateY(-1px)";
                btn.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.transform = "translateY(0)";
                btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            });

            // 点击事件
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                btn.textContent = L.autoBuyButtonActive;
                
                try {
                    await completePurchaseProcess();
                } catch (error) {
                    console.error('购买流程错误:', error);
                    toast.show(L.purchaseError, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = L.autoBuyButton;
                }
            });

            nameDiv.parentNode.insertBefore(btn, nameDiv.nextSibling);
        });
    });

    // 监听输入变化
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('Input_input__2-t98')) {
            setTimeout(updateMaterialDisplays, 100);
        }
    });

    // 开始观察
    observer.observe(document.body, { childList: true, subtree: true });

    // 定期清理工具提示
    setInterval(() => {
        document.querySelectorAll('.ItemTooltipText_itemTooltipText__zFq3A').forEach(tooltip => {
            if (tooltip.parentElement) tooltip.parentElement.style.display = 'none';
        });
    }, 5000);

})();