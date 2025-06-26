// ==UserScript==
// @name         [银河奶牛] 生产采集增强 / MWI Production & Gathering Enhanced
// @name:zh-CN   [银河奶牛]生产采集增强
// @name:en      MWI Production & Gathering Enhanced
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  计算制造、烹饪、强化、房屋所需材料并一键购买，计算实时炼金利润，增加按照目标材料数量进行采集的功能，快速切换角色
// @description:en  Calculate materials for crafting, cooking, enhancing, housing with one-click purchase, calculate real-time alchemy profits, add target-based gathering functionality, fast character switching
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
            ALCHEMY_CACHE_EXPIRY: 300000, // 炼金缓存5分钟
            COLORS: {
                buy: 'var(--color-market-buy)',
                buyHover: 'var(--color-market-buy-hover)',
                sell: 'var(--color-market-sell)',
                sellHover: 'var(--color-market-sell-hover)',
                disabled: 'var(--color-disabled)',
                error: '#ff6b6b',
                text: 'var(--color-text-dark-mode)',
                warning: 'var(--color-warning)',
                space300: 'var(--color-space-300)'
            }
        };

        // 语言配置
        const LANG = (navigator.language || 'en').toLowerCase().includes('zh') ? {
            directBuy: '直购材料(左一)', bidOrder: '求购材料(右一)',
            directBuyUpgrade: '左一', bidOrderUpgrade: '右一',
            buying: '⏳ 购买中...', submitting: '📋 提交中...',
            missing: '缺:', sufficient: '材料充足！', sufficientUpgrade: '升级物品充足！',
            starting: '开始', materials: '种材料', upgradeItems: '种升级物品',
            purchased: '已购买', submitted: '订单已提交', failed: '失败', complete: '完成！',
            error: '出错，请检查控制台', wsNotAvailable: 'WebSocket接口未可用', waiting: '等待接口就绪...',
            ready: '接口已就绪！', success: '成功', each: '个', allFailed: '全部失败',
            targetLabel: '目标',
            // 炼金相关
            pessimisticProfit: '悲观日利润', optimisticProfit: '乐观日利润',
            calculating: '计算中...', noData: '缺少市场数据',
            waitingAPI: '游戏核心对象获取失败...',
            loadSuccess: '[[银河奶牛]炼金利润计算器] 加载并初始化成功',
            loadFailed: '[[银河奶牛]炼金利润计算器] 加载失败'
        } : {
            directBuy: 'Buy Materials', bidOrder: 'Bid Materials',
            directBuyUpgrade: 'Buy', bidOrderUpgrade: 'Bid',
            buying: '⏳ Buying...', submitting: '📋 Submitting...',
            missing: 'Need:', sufficient: 'All materials sufficient!', sufficientUpgrade: 'All upgrades sufficient!',
            starting: 'Start', materials: 'materials', upgradeItems: 'upgrade items',
            purchased: 'Purchased', submitted: 'Order submitted', failed: 'failed', complete: 'completed!',
            error: 'error, check console', wsNotAvailable: 'WebSocket interface not available', waiting: 'Waiting for interface...',
            ready: 'Interface ready!', success: 'Successfully', each: '', allFailed: 'All failed',
            targetLabel: 'Target',
            // 炼金相关
            pessimisticProfit: 'Pessimistic Daily Profit', optimisticProfit: 'Optimistic Daily Profit',
            calculating: 'Calculating...', noData: 'Lack of Market Data',
            waitingAPI: 'Game core object acquisition failed...',
            loadSuccess: '[MWI-Alchemy Profit Calculator] loaded and initialized successfully',
            loadFailed: '[MWI-Alchemy Profit Calculator] Failed to load'
        };

        // 采集动作配置
        const gatheringActions = [
            { "hrid": "/actions/milking/cow", "itemHrid": "/items/milk" },
            { "hrid": "/actions/milking/verdant_cow", "itemHrid": "/items/verdant_milk" },
            { "hrid": "/actions/milking/azure_cow", "itemHrid": "/items/azure_milk" },
            { "hrid": "/actions/milking/burble_cow", "itemHrid": "/items/burble_milk" },
            { "hrid": "/actions/milking/crimson_cow", "itemHrid": "/items/crimson_milk" },
            { "hrid": "/actions/milking/unicow", "itemHrid": "/items/rainbow_milk" },
            { "hrid": "/actions/milking/holy_cow", "itemHrid": "/items/holy_milk" },
            { "hrid": "/actions/foraging/egg", "itemHrid": "/items/egg" },
            { "hrid": "/actions/foraging/wheat", "itemHrid": "/items/wheat" },
            { "hrid": "/actions/foraging/sugar", "itemHrid": "/items/sugar" },
            { "hrid": "/actions/foraging/cotton", "itemHrid": "/items/cotton" },
            { "hrid": "/actions/foraging/blueberry", "itemHrid": "/items/blueberry" },
            { "hrid": "/actions/foraging/apple", "itemHrid": "/items/apple" },
            { "hrid": "/actions/foraging/arabica_coffee_bean", "itemHrid": "/items/arabica_coffee_bean" },
            { "hrid": "/actions/foraging/flax", "itemHrid": "/items/flax" },
            { "hrid": "/actions/foraging/blackberry", "itemHrid": "/items/blackberry" },
            { "hrid": "/actions/foraging/orange", "itemHrid": "/items/orange" },
            { "hrid": "/actions/foraging/robusta_coffee_bean", "itemHrid": "/items/robusta_coffee_bean" },
            { "hrid": "/actions/foraging/strawberry", "itemHrid": "/items/strawberry" },
            { "hrid": "/actions/foraging/plum", "itemHrid": "/items/plum" },
            { "hrid": "/actions/foraging/liberica_coffee_bean", "itemHrid": "/items/liberica_coffee_bean" },
            { "hrid": "/actions/foraging/bamboo_branch", "itemHrid": "/items/bamboo_branch" },
            { "hrid": "/actions/foraging/mooberry", "itemHrid": "/items/mooberry" },
            { "hrid": "/actions/foraging/peach", "itemHrid": "/items/peach" },
            { "hrid": "/actions/foraging/excelsa_coffee_bean", "itemHrid": "/items/excelsa_coffee_bean" },
            { "hrid": "/actions/foraging/cocoon", "itemHrid": "/items/cocoon" },
            { "hrid": "/actions/foraging/marsberry", "itemHrid": "/items/marsberry" },
            { "hrid": "/actions/foraging/dragon_fruit", "itemHrid": "/items/dragon_fruit" },
            { "hrid": "/actions/foraging/fieriosa_coffee_bean", "itemHrid": "/items/fieriosa_coffee_bean" },
            { "hrid": "/actions/foraging/spaceberry", "itemHrid": "/items/spaceberry" },
            { "hrid": "/actions/foraging/star_fruit", "itemHrid": "/items/star_fruit" },
            { "hrid": "/actions/foraging/spacia_coffee_bean", "itemHrid": "/items/spacia_coffee_bean" },
            { "hrid": "/actions/foraging/radiant_fiber", "itemHrid": "/items/radiant_fiber" },
            { "hrid": "/actions/woodcutting/tree", "itemHrid": "/items/log" },
            { "hrid": "/actions/woodcutting/birch_tree", "itemHrid": "/items/birch_log" },
            { "hrid": "/actions/woodcutting/cedar_tree", "itemHrid": "/items/cedar_log" },
            { "hrid": "/actions/woodcutting/purpleheart_tree", "itemHrid": "/items/purpleheart_log" },
            { "hrid": "/actions/woodcutting/ginkgo_tree", "itemHrid": "/items/ginkgo_log" },
            { "hrid": "/actions/woodcutting/redwood_tree", "itemHrid": "/items/redwood_log" },
            { "hrid": "/actions/woodcutting/arcane_tree", "itemHrid": "/items/arcane_log" }
        ];

        const gatheringActionsMap = new Map(gatheringActions.map(action => [action.hrid, action.itemHrid]));

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
            },
            // 炼金选择器
            alchemy: {
                container: '.SkillActionDetail_alchemyComponent__1J55d',
                info: '.SkillActionDetail_info__3umoI',
                instructions: '.SkillActionDetail_instructions___EYV5',
                requirements: '.SkillActionDetail_itemRequirements__3SPnA',
                drops: '.SkillActionDetail_dropTable__3ViVp',
                consumables: '.ActionTypeConsumableSlots_consumableSlots__kFKk0',
                catalyst: '.SkillActionDetail_catalystItemInputContainer__5zmou',
                successRate: '.SkillActionDetail_successRate__2jPEP .SkillActionDetail_value__dQjYH',
                timeCost: '.SkillActionDetail_timeCost__1jb2x .SkillActionDetail_value__dQjYH',
                notes: '.SkillActionDetail_notes__2je2F'
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
            },

            extractActionDetailData(element) {
                try {
                    const reactKey = Object.keys(element).find(key => key.startsWith('__reactProps\$'));
                    return reactKey ? element[reactKey]?.children?.[0]?._owner?.memoizedProps?.actionDetail?.hrid : null;
                } catch {
                    return null;
                }
            },

            // 炼金工具函数
            getReactProps(el) {
                const key = Object.keys(el || {}).find(k => k.startsWith('__reactProps\$'));
                return key ? el[key]?.children[0]?._owner?.memoizedProps : null;
            },

            isCacheExpired(item, timestamps, expiry = CONFIG.ALCHEMY_CACHE_EXPIRY) {
                return !timestamps[item] || Date.now() - timestamps[item] > expiry;
            },

            formatProfit(profit) {
                const abs = Math.abs(profit);
                const sign = profit < 0 ? '-' : '';
                if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
                if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
                if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
                return profit.toString();
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
            hookMessage(messageType, callback) { return window.AutoBuyAPI.hookMessage(messageType, callback); }
        }

        // 炼金利润计算器
        class AlchemyProfitCalculator {
            constructor(api) {
                this.api = api;
                this.marketData = {};
                this.marketTimestamps = {};
                this.requestQueue = [];
                this.isProcessing = false;
                this.lastState = '';
                this.updateTimeout = null;
                this.initialized = false;

                this.init();
            }

            async init() {
                // 等待API就绪
                while (!window.AutoBuyAPI?.core || !this.api.isReady) {
                    await utils.delay(100);
                }

                try {
                    // 监听市场订单簿更新事件
                    window.AutoBuyAPI.hookMessage("market_item_order_books_updated", obj => {
                        const { itemHrid, orderBooks } = obj.marketItemOrderBooks;
                        this.marketData[itemHrid] = orderBooks;
                        this.marketTimestamps[itemHrid] = Date.now();
                    });

                    this.initialized = true;
                } catch (error) {
                    console.error(\`%c\${LANG.loadFailed}\`, 'color: #F44336; font-weight: bold;', error);
                }

                // 定期清理过期缓存
                setInterval(() => this.cleanCache(), 60000);
            }

            cleanCache() {
                const now = Date.now();
                Object.keys(this.marketTimestamps).forEach(item => {
                    if (now - this.marketTimestamps[item] > CONFIG.ALCHEMY_CACHE_EXPIRY) {
                        delete this.marketData[item];
                        delete this.marketTimestamps[item];
                    }
                });
            }

            async processQueue() {
                if (this.isProcessing || !this.requestQueue.length || !this.initialized || !window.AutoBuyAPI?.core) return;
                this.isProcessing = true;

                while (this.requestQueue.length > 0) {
                    const batch = this.requestQueue.splice(0, 6);
                    await Promise.all(batch.map(async ({ itemHrid, resolve }) => {
                        if (this.marketData[itemHrid] && !utils.isCacheExpired(itemHrid, this.marketTimestamps)) {
                            return resolve(this.marketData[itemHrid]);
                        }

                        if (utils.isCacheExpired(itemHrid, this.marketTimestamps)) {
                            delete this.marketData[itemHrid];
                            delete this.marketTimestamps[itemHrid];
                        }

                        try {
                            window.AutoBuyAPI.core.handleGetMarketItemOrderBooks(itemHrid);
                        } catch (error) {
                            console.error('炼金API调用失败:', error);
                        }

                        const start = Date.now();
                        await new Promise(waitResolve => {
                            const check = setInterval(() => {
                                if (this.marketData[itemHrid] || Date.now() - start > 5000) {
                                    clearInterval(check);
                                    resolve(this.marketData[itemHrid] || null);
                                    waitResolve();
                                }
                            }, 50);
                        });
                    }));

                    if (this.requestQueue.length > 0) await utils.delay(100);
                }
                this.isProcessing = false;
            }

            getMarketData(itemHrid) {
                return new Promise(resolve => {
                    if (this.marketData[itemHrid] && !utils.isCacheExpired(itemHrid, this.marketTimestamps)) {
                        return resolve(this.marketData[itemHrid]);
                    }
                    if (!this.initialized || !window.AutoBuyAPI?.core) {
                        return resolve(null);
                    }

                    this.requestQueue.push({ itemHrid, resolve });
                    this.processQueue();
                });
            }

            async getItemData(el, dropIndex = -1, reqIndex = -1) {
                const href = el?.querySelector('svg use')?.getAttribute('href');
                const itemHrid = href ? \`/items/\${href.split('#')[1]}\` : null;
                if (!itemHrid) {
                    return null;
                }

                let enhancementLevel = 0;
                if (reqIndex >= 0) {
                    const enhancementEl = el.querySelector('.Item_enhancementLevel__19g-e');
                    if (enhancementEl) {
                        const match = enhancementEl.textContent.match(/\\+(\\d+)/);
                        enhancementLevel = match ? parseInt(match[1]) : 0;
                    }
                }

                let asks = 0, bids = 0;
                if (itemHrid === '/items/coin') {
                    asks = bids = 1;
                } else {
                    const orderBooks = await this.getMarketData(itemHrid);
                    if (orderBooks?.[enhancementLevel]) {
                        const { asks: asksList, bids: bidsList } = orderBooks[enhancementLevel];
                        if (reqIndex >= 0) {
                            asks = asksList?.length > 0 ? asksList[0].price : null;
                            bids = bidsList?.length > 0 ? bidsList[0].price : null;
                        } else {
                            asks = asksList?.[0]?.price || 0;
                            bids = bidsList?.[0]?.price || 0;
                        }
                    } else {
                        asks = bids = reqIndex >= 0 ? null : orderBooks ? -1 : 0;
                    }
                }

                const result = { itemHrid, asks, bids, enhancementLevel };

                if (reqIndex >= 0) {
                    const countEl = document.querySelectorAll('.SkillActionDetail_itemRequirements__3SPnA .SkillActionDetail_inputCount__1rdrn')[reqIndex];
                    result.count = parseInt(countEl?.textContent?.replace(/,/g, '').match(/\\d+/)?.[0]) || 1;
                } else if (dropIndex >= 0) {
                    const dropEl = document.querySelectorAll('.SkillActionDetail_drop__26KBZ')[dropIndex];
                    const text = dropEl?.textContent || '';
                    result.count = parseInt(text.match(/^([\\d,]+)/)?.[1]?.replace(/,/g, '')) || 1;
                    result.dropRate = parseFloat(text.match(/(\\d+(?:\\.\\d+)?)%/)?.[1]) / 100 || 1;
                }

                return result;
            }

            calculateEfficiency() {
                const props = utils.getReactProps(document.querySelector('.SkillActionDetail_alchemyComponent__1J55d'));
                if (!props) return 0;

                const level = props.characterSkillMap?.get('/skills/alchemy')?.level || 0;

                let itemLevel = 0;
                const notesEl = document.querySelector('.SkillActionDetail_notes__2je2F');
                if (notesEl) {
                    const match = notesEl.childNodes[0]?.textContent?.match(/\\d+/);
                    itemLevel = match ? parseInt(match[0]) : 0;
                }

                const buffEfficiency = (props.actionBuffs || [])
                    .filter(b => b.typeHrid === '/buff_types/efficiency')
                    .reduce((sum, b) => sum + (b.flatBoost || 0), 0);

                return buffEfficiency + Math.max(0, level - itemLevel) / 100;
            }

            hasNullPrices(data, useOptimistic) {
                const checkItems = (items) => items.some(item =>
                    (useOptimistic ? item.bids : item.asks) === null
                );

                return checkItems(data.requirements) ||
                       checkItems(data.drops) ||
                       checkItems(data.consumables) ||
                       (useOptimistic ? data.catalyst.bids : data.catalyst.asks) === null;
            }

            async getAlchemyData() {
                const getValue = sel => parseFloat(document.querySelector(sel)?.textContent) || 0;

                const successRate = getValue('.SkillActionDetail_successRate__2jPEP .SkillActionDetail_value__dQjYH') / 100;
                const timeCost = getValue('.SkillActionDetail_timeCost__1jb2x .SkillActionDetail_value__dQjYH');

                if (!successRate || !timeCost) {
                    return null;
                }

                const reqEls = [...document.querySelectorAll('.SkillActionDetail_itemRequirements__3SPnA .Item_itemContainer__x7kH1')];
                const dropEls = [...document.querySelectorAll('.SkillActionDetail_dropTable__3ViVp .Item_itemContainer__x7kH1')];
                const consumEls = [...document.querySelectorAll('.ActionTypeConsumableSlots_consumableSlots__kFKk0 .Item_itemContainer__x7kH1')];
                const catalystEl = document.querySelector('.SkillActionDetail_catalystItemInputContainer__5zmou .ItemSelector_itemContainer__3olqe') ||
                                 document.querySelector('.SkillActionDetail_catalystItemInputContainer__5zmou .SkillActionDetail_itemContainer__2TT5f');

                const [requirements, drops, consumables, catalyst] = await Promise.all([
                    Promise.all(reqEls.map((el, i) => this.getItemData(el, -1, i))),
                    Promise.all(dropEls.map((el, i) => this.getItemData(el, i))),
                    Promise.all(consumEls.map(el => this.getItemData(el))),
                    catalystEl ? this.getItemData(catalystEl) : Promise.resolve({ asks: 0, bids: 0 })
                ]);

                const result = {
                    successRate, timeCost,
                    efficiency: this.calculateEfficiency(),
                    requirements: requirements.filter(Boolean),
                    drops: drops.filter(Boolean),
                    catalyst: catalyst || { asks: 0, bids: 0 },
                    consumables: consumables.filter(Boolean)
                };

                return result;
            }

            calculateProfit(data, useOptimistic) {
                if (this.hasNullPrices(data, useOptimistic)) return null;

                const totalReqCost = data.requirements.reduce((sum, item) =>
                    sum + (useOptimistic ? item.bids : item.asks) * item.count, 0);

                const catalystPrice = useOptimistic ? data.catalyst.bids : data.catalyst.asks;
                const costPerAttempt = totalReqCost * (1 - data.successRate) + (totalReqCost + catalystPrice) * data.successRate;

                const incomePerAttempt = data.drops.reduce((sum, drop) => {
                    const price = useOptimistic ? drop.asks : drop.bids;
                    let income = price * drop.dropRate * drop.count * data.successRate;
                    if (drop.itemHrid !== '/items/coin') income *= 0.98;
                    return sum + income;
                }, 0);

                const drinkCost = data.consumables.reduce((sum, item) =>
                    sum + (useOptimistic ? item.bids : item.asks), 0);

                const netProfitPerAttempt = incomePerAttempt - costPerAttempt;
                const profitPerSecond = (netProfitPerAttempt * (1 + data.efficiency)) / data.timeCost - drinkCost / 300;

                return Math.round(profitPerSecond * 86400);
            }

            getStateFingerprint() {
                const consumables = document.querySelectorAll('.ActionTypeConsumableSlots_consumableSlots__kFKk0 .Item_itemContainer__x7kH1');
                const successRate = document.querySelector('.SkillActionDetail_successRate__2jPEP .SkillActionDetail_value__dQjYH')?.textContent || '';
                const consumablesState = Array.from(consumables).map(el =>
                    el.querySelector('svg use')?.getAttribute('href') || 'empty').join('|');
                return \`\${consumablesState}:\${successRate}\`;
            }

            debounceUpdate(callback) {
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(callback, 200);
            }

            async updateProfitDisplay() {
                const [pessimisticEl, optimisticEl] = ['pessimistic-profit', 'optimistic-profit'].map(id => document.getElementById(id));
                if (!pessimisticEl || !optimisticEl) return;

                if (!this.initialized || !window.AutoBuyAPI?.core) {
                    pessimisticEl.textContent = optimisticEl.textContent = LANG.waitingAPI;
                    pessimisticEl.style.color = optimisticEl.style.color = CONFIG.COLORS.warning;
                    return;
                }

                try {
                    const data = await this.getAlchemyData();
                    if (!data) {
                        pessimisticEl.textContent = optimisticEl.textContent = LANG.noData;
                        pessimisticEl.style.color = optimisticEl.style.color = CONFIG.COLORS.disabled;
                        return;
                    }

                    [false, true].forEach((useOptimistic, index) => {
                        const profit = this.calculateProfit(data, useOptimistic);
                        const el = index ? optimisticEl : pessimisticEl;

                        if (profit === null) {
                            el.textContent = LANG.noData;
                            el.style.color = CONFIG.COLORS.disabled;
                        } else {
                            el.textContent = utils.formatProfit(profit);
                            el.style.color = profit >= 0 ? CONFIG.COLORS.buy : CONFIG.COLORS.sell;
                        }
                    });
                } catch (error) {
                    console.error('炼金利润计算出错:', error);
                    pessimisticEl.textContent = optimisticEl.textContent = LANG.error;
                    pessimisticEl.style.color = optimisticEl.style.color = CONFIG.COLORS.warning;
                }
            }

            createProfitDisplay() {
                const container = document.createElement('div');
                container.id = 'alchemy-profit-display';
                container.style.cssText = 'display:flex;flex-direction:column;gap:10px;font-family:Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;letter-spacing:0.00938em;color:var(--color-text-dark-mode);font-weight:400';
                container.innerHTML = \`
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:\${CONFIG.COLORS.space300}">\${LANG.pessimisticProfit}</span>
                        <span id="pessimistic-profit" style="font-weight:400">\${this.initialized ? LANG.calculating : LANG.waitingAPI}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:\${CONFIG.COLORS.space300}">\${LANG.optimisticProfit}</span>
                        <span id="optimistic-profit" style="font-weight:400">\${this.initialized ? LANG.calculating : LANG.waitingAPI}</span>
                    </div>
                \`;
                return container;
            }
        }

        // 自动停止管理器
        class AutoStopManager {
            constructor() {
                this.activeMonitors = new Map();
                this.pendingActions = new Map();
                this.processedComponents = new WeakSet();
                this.setupWebSocketHooks();
            }

            setupWebSocketHooks() {
                const waitForAPI = () => {
                    if (window.AutoBuyAPI?.hookMessage) {
                        this.initHooks();
                    } else {
                        setTimeout(waitForAPI, 1000);
                    }
                };
                waitForAPI();
            }

            initHooks() {
                try {
                    window.AutoBuyAPI.hookMessage('new_character_action', (data) => this.handleNewAction(data));
                    window.AutoBuyAPI.hookMessage('actions_updated', (data) => this.handleActionsUpdated(data));
                } catch (error) {
                    console.error('[AutoStop] 设置WebSocket监听失败:', error);
                }
            }

            handleNewAction(data) {
                const actionHrid = data.newCharacterActionData?.actionHrid;
                if (!actionHrid || !gatheringActionsMap.has(actionHrid)) return;

                const targetCount = this.getCurrentTargetCount();
                if (targetCount > 0) {
                    this.pendingActions.set(actionHrid, targetCount);
                }
            }

            handleActionsUpdated(data) {
                if (!data.endCharacterActions?.length) return;

                data.endCharacterActions.forEach(action => {
                    if (action.isDone && this.activeMonitors.has(action.id)) {
                        this.stopMonitoring(action.id);
                    }

                    if (this.pendingActions.has(action.actionHrid)) {
                        const targetCount = this.pendingActions.get(action.actionHrid);
                        this.pendingActions.delete(action.actionHrid);
                        this.startMonitoring(action.id, action.actionHrid, targetCount);
                    }
                });
            }

            startMonitoring(actionId, actionHrid, targetCount) {
                const itemHrid = gatheringActionsMap.get(actionHrid);
                if (!itemHrid) return;

                this.stopMonitoring(actionId);

                const itemId = itemHrid.replace('/items/', '');
                const startCount = utils.getCountById(itemId);

                const intervalId = setInterval(() => {
                    try {
                        const currentCount = utils.getCountById(itemId);
                        const collectedCount = Math.max(0, currentCount - startCount);

                        if (collectedCount >= targetCount) {
                            this.stopAction(actionId);
                            this.stopMonitoring(actionId);
                        }
                    } catch (error) {
                        console.error('[AutoStop] 监控出错:', error);
                    }
                }, 1000);

                this.activeMonitors.set(actionId, { intervalId, targetCount });
            }

            stopMonitoring(actionId) {
                const monitor = this.activeMonitors.get(actionId);
                if (monitor) {
                    clearInterval(monitor.intervalId);
                    this.activeMonitors.delete(actionId);
                }
            }

            stopAction(actionId) {
                try {
                    window.AutoBuyAPI?.core?.handleCancelCharacterAction?.(actionId);
                } catch (error) {
                    console.error('[AutoStop] 取消动作失败:', error);
                }
            }

            getCurrentTargetCount() {
                const input = document.querySelector('.auto-stop-target-input');
                return input ? parseInt(input.value) || 0 : 0;
            }

            cleanup() {
                this.activeMonitors.forEach(monitor => clearInterval(monitor.intervalId));
                this.activeMonitors.clear();
                this.pendingActions.clear();
            }

            createInfinityButton() {
                const nativeButton = document.querySelector('button .SkillActionDetail_unlimitedIcon__mZYJc')?.parentElement;

                if (nativeButton) {
                    const clone = nativeButton.cloneNode(true);
                    clone.getAttributeNames().filter(name => name.startsWith('data-')).forEach(attr => clone.removeAttribute(attr));
                    return clone;
                }

                const button = document.createElement('button');
                button.className = 'Button_button__1Fe9z Button_small__3fqC7';

                const container = document.createElement('div');
                container.className = 'SkillActionDetail_unlimitedIcon__mZYJc';

                const svg = document.createElement('svg');
                Object.assign(svg, {
                    role: 'img',
                    'aria-label': 'Unlimited',
                    className: 'Icon_icon__2LtL_ Icon_xtiny__331pI',
                    width: '100%',
                    height: '100%'
                });
                svg.style.margin = '-2px -1px';

                const use = document.createElement('use');
                use.setAttribute('href', '/static/media/misc_sprite.6b3198dc.svg#infinity');

                svg.appendChild(use);
                container.appendChild(svg);
                button.appendChild(container);

                setTimeout(() => {
                    if (svg.getBoundingClientRect().width === 0) {
                        button.innerHTML = '<span style="font-size: 14px; font-weight: bold;">∞</span>';
                    }
                }, 500);

                return button;
            }

            createAutoStopUI() {
                const container = document.createElement('div');
                container.className = 'SkillActionDetail_maxActionCountInput__1C0Pw auto-stop-ui';

                const label = document.createElement('div');
                label.className = 'SkillActionDetail_label__1mGQJ';
                label.textContent = LANG.targetLabel;

                const inputArea = document.createElement('div');
                inputArea.className = 'SkillActionDetail_input__1G-kE';

                const inputContainer = document.createElement('div');
                inputContainer.className = 'Input_inputContainer__22GnD Input_small__1-Eva';

                const input = document.createElement('input');
                input.className = 'Input_input__2-t98 auto-stop-target-input';
                input.type = 'text';
                input.maxLength = '10';
                input.value = '0';

                const setOneButton = document.createElement('button');
                setOneButton.className = 'Button_button__1Fe9z Button_small__3fqC7';
                setOneButton.textContent = '1';

                const setInfinityButton = this.createInfinityButton();

                const updateStatus = () => {
                    const targetCount = parseInt(input.value) || 0;

                    if (targetCount > 0) {
                        setInfinityButton.classList.remove('Button_disabled__wCyIq');
                        input.value = targetCount.toString();
                        setOneButton.classList.toggle('Button_disabled__wCyIq', targetCount === 1);
                    } else {
                        setInfinityButton.classList.add('Button_disabled__wCyIq');
                        setOneButton.classList.remove('Button_disabled__wCyIq');
                        input.value = '∞';
                    }

                    if (this.activeMonitors.size > 0) {
                        if (targetCount <= 0) {
                            this.activeMonitors.forEach((_, actionId) => this.stopMonitoring(actionId));
                        } else {
                            this.activeMonitors.forEach(monitor => monitor.targetCount = targetCount);
                        }
                    }
                };

                setOneButton.addEventListener('click', () => {
                    input.value = '1';
                    updateStatus();
                });

                setInfinityButton.addEventListener('click', () => {
                    input.value = '0';
                    updateStatus();
                });

                input.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (value === '∞' || !isNaN(parseInt(value))) updateStatus();
                });

                input.addEventListener('focus', (e) => e.target.select());
                input.addEventListener('blur', updateStatus);
                input.addEventListener('keydown', (e) => {
                    if (input.value === '∞' && /[0-9]/.test(e.key)) {
                        e.preventDefault();
                        input.value = e.key;
                        updateStatus();
                    }
                });

                updateStatus();

                inputContainer.appendChild(input);
                inputArea.appendChild(inputContainer);
                container.append(label, inputArea, setOneButton, setInfinityButton);

                return container;
            }

            injectAutoStopUI() {
                const skillElement = document.querySelector('.SkillActionDetail_regularComponent__3oCgr');
                if (!skillElement || this.processedComponents.has(skillElement)) return false;

                const maxInput = skillElement.querySelector('.SkillActionDetail_maxActionCountInput__1C0Pw');
                if (!maxInput || skillElement.querySelector('.auto-stop-ui')) return false;

                const hrid = utils.extractActionDetailData(skillElement);
                if (!hrid || !gatheringActionsMap.has(hrid)) return false;

                this.processedComponents.add(skillElement);
                maxInput.parentNode.insertBefore(this.createAutoStopUI(), maxInput.nextSibling);
                return true;
            }
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

                this.calculateMaterialRequirements(container, selectors, executionCount, type, requirements);

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
                this.autoStopManager = new AutoStopManager();
                this.alchemyCalculator = new AlchemyProfitCalculator(this.api);
                this.observer = null;
                this.loggerReady = false;
                this.alchemyObservers = [];
                // 将实例暴露给全局
                window.uiManager = this;
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
                            this.initObserver();
                            break;
                        }
                    } catch {}

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

                document.querySelectorAll(\`.\${className}\`).forEach((span, index) => {
                    const materialReq = requirements.filter(req => req.type === 'material')[index];
                    if (materialReq) {
                        const needed = materialReq.supplementNeeded;
                        span.textContent = \`\${LANG.missing}\${needed}\`;
                        span.style.color = needed > 0 ? CONFIG.COLORS.error : CONFIG.COLORS.text;
                    }
                });

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

            // 炼金UI管理
            setupAlchemyUI() {
                const alchemyComponent = document.querySelector('.SkillActionDetail_alchemyComponent__1J55d');
                const instructionsEl = document.querySelector('.SkillActionDetail_instructions___EYV5');
                const infoContainer = document.querySelector('.SkillActionDetail_info__3umoI');
                const existingDisplay = document.getElementById('alchemy-profit-display');

                const shouldShow = alchemyComponent && !instructionsEl && infoContainer;

                if (shouldShow && !existingDisplay) {
                    const container = this.alchemyCalculator.createProfitDisplay();
                    infoContainer.appendChild(container);

                    this.alchemyCalculator.lastState = this.alchemyCalculator.getStateFingerprint();

                    // 清理旧的观察器并设置新的
                    this.alchemyObservers.forEach(obs => obs?.disconnect());
                    this.alchemyObservers = [
                        this.setupObserver('.ActionTypeConsumableSlots_consumableSlots__kFKk0', () => {
                            const currentState = this.alchemyCalculator.getStateFingerprint();
                            if (currentState !== this.alchemyCalculator.lastState) {
                                this.alchemyCalculator.lastState = currentState;
                                this.alchemyCalculator.debounceUpdate(() => this.alchemyCalculator.updateProfitDisplay());
                            }
                        }),
                        this.setupObserver('.SkillActionDetail_successRate__2jPEP .SkillActionDetail_value__dQjYH', () => {
                            const currentState = this.alchemyCalculator.getStateFingerprint();
                            if (currentState !== this.alchemyCalculator.lastState) {
                                this.alchemyCalculator.lastState = currentState;
                                this.alchemyCalculator.debounceUpdate(() => this.alchemyCalculator.updateProfitDisplay());
                            }
                        }, { characterData: true })
                    ].filter(Boolean);

                    setTimeout(() => this.alchemyCalculator.updateProfitDisplay(), this.alchemyCalculator.initialized ? 50 : 100);
                } else if (!shouldShow && existingDisplay) {
                    existingDisplay.remove();
                    this.alchemyObservers.forEach(obs => obs?.disconnect());
                    this.alchemyObservers = [];
                }
            }

            setupObserver(selector, callback, options = {}) {
                const element = document.querySelector(selector);
                if (!element) return null;

                const observer = new MutationObserver(callback);
                observer.observe(element, { childList: true, subtree: true, attributes: true, ...options });
                return observer;
            }

            initObserver() {
                if (this.observer) return;

                this.observer = new MutationObserver(() => {
                    Object.keys(SELECTORS).forEach(type => {
                        if (type !== 'alchemy') this.setupUI(type);
                    });
                    // 检查炼金UI
                    this.setupAlchemyUI();
                    // 检查自动停止UI
                    this.autoStopManager.injectAutoStopUI();
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

                        // 检查是否需要更新炼金显示
                        if (e.target.closest('.AlchemyPanel_alchemyPanel__1Sa8_ .MuiTabs-flexContainer') ||
                            e.target.closest('[class*="ItemSelector"]') ||
                            e.target.closest('.Item_itemContainer__x7kH1') ||
                            e.target.closest('[class*="SkillAction"]') ||
                            e.target.closest('.MuiPopper-root.MuiTooltip-popper.MuiTooltip-popperInteractive.css-w9tg40')) {
                            setTimeout(() => {
                                if (document.getElementById('alchemy-profit-display')) {
                                    this.alchemyCalculator.debounceUpdate(() => this.alchemyCalculator.updateProfitDisplay());
                                }
                            }, 1);
                        }
                    }
                });

                // 初始设置
                Object.keys(SELECTORS).forEach(type => {
                    if (type !== 'alchemy') this.setupUI(type);
                });
                this.setupAlchemyUI();

                // 自动停止UI观察器
                let frameId = null;
                const scheduleUICheck = () => {
                    if (frameId) cancelAnimationFrame(frameId);
                    frameId = requestAnimationFrame(() => {
                        this.autoStopManager.injectAutoStopUI();
                        frameId = null;
                    });
                };

                new MutationObserver(mutations => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE &&
                                    (node.classList?.contains('SkillActionDetail_regularComponent__3oCgr') ||
                                     node.querySelector?.('.SkillActionDetail_regularComponent__3oCgr') ||
                                     node.classList?.contains('SkillActionDetail_maxActionCountInput__1C0Pw'))) {
                                    scheduleUICheck();
                                    return;
                                }
                            }
                        }
                    }
                }).observe(document.body, { childList: true, subtree: true });
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

                const materialButtonContainer = document.createElement('div');
                materialButtonContainer.className = 'buy-buttons-container';

                const baseStyles = { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', marginBottom: '8px' };
                const typeStyles = {
                    house: { width: 'fit-content', margin: '0 auto 8px auto', maxWidth: '280px', minWidth: '260px' },
                    enhancing: { width: 'fit-content', margin: '0 auto 8px auto', maxWidth: '300px', minWidth: '260px' }
                };

                utils.applyStyles(materialButtonContainer, { ...baseStyles, ...typeStyles[type] });

                const directBuyBtn = this.createButton(LANG.directBuy, () => this.purchaseMaterials(type, false), false);
                const bidOrderBtn = this.createButton(LANG.bidOrder, () => this.purchaseMaterials(type, true), true);
                materialButtonContainer.append(directBuyBtn, bidOrderBtn);

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

        // 初始化
        const uiManager = new UIManager();

        // 清理函数
        window.addEventListener('beforeunload', () => {
            if (uiManager.autoStopManager) {
                uiManager.autoStopManager.cleanup();
            }
            if (uiManager.alchemyObservers) {
                uiManager.alchemyObservers.forEach(obs => obs?.disconnect());
            }
        });

        // 初始化自动停止UI（如果页面已加载）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                    uiManager.autoStopManager.injectAutoStopUI();
                    uiManager.setupAlchemyUI();
                }, 1000);
            });
        } else {
            setTimeout(() => {
                uiManager.autoStopManager.injectAutoStopUI();
                uiManager.setupAlchemyUI();
            }, 1000);
        }

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

    /**
 * 银河奶牛角色快速切换器
 * 支持双语、内存缓存、点击头像切换
 */
    class CharacterSwitcher {
        constructor(options = {}) {
            // 配置选项
            this.config = {
                autoInit: true,
                preloadDelay: 2000,
                avatarSelector: '.Header_avatar__2RQgo',
                characterInfoSelector: '.Header_characterInfo__3ixY8',
                ...options
            };

            // 内存缓存
            this.charactersCache = null;
            this.isLoadingCharacters = false;
            this.observer = null;

            // 双语配置
            this.languages = {
                'zh': {
                    switchCharacter: '切换角色',
                    noCharacterData: '暂无角色数据，请刷新页面重试',
                    current: '当前', switch: '切换', standard: '标准', ironcow: '铁牛'
                },
                'en': {
                    switchCharacter: 'Switch Character',
                    noCharacterData: 'No character data available, please refresh the page',
                    current: 'Current', switch: 'Switch', standard: 'Standard', ironcow: 'Iron Cow'
                }
            };

            if (this.config.autoInit) {
                this.init();
            }
        }

        // 初始化
        init() {
            this.setupEventListeners();
            this.startObserver();
            if (this.config.preloadDelay > 0) {
                setTimeout(() => this.preloadCharacters(), this.config.preloadDelay);
            }
        }

        // 销毁实例
        destroy() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            this.removeEventListeners();
            this.closeDropdown();
            this.charactersCache = null;
        }

        // 工具方法
        getCurrentLanguage() {
            return (navigator.language || 'en').startsWith('zh') ? 'zh' : 'en';
        }

        getText(key) {
            return this.languages[this.getCurrentLanguage()][key] || key;
        }

        getCurrentCharacterId() {
            return new URLSearchParams(window.location.search).get('characterId');
        }

        getServerType() {
            return window.location.hostname.includes('test') ? 'test' : 'main';
        }

        getApiUrl() {
            return this.getServerType() === 'test'
                ? 'https://api-test.milkywayidle.com/v1/characters'
                : 'https://api.milkywayidle.com/v1/characters';
        }

        // 从API获取角色数据
        async fetchCharactersFromAPI() {
            const response = await fetch(this.getApiUrl(), {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data.characters || [];
        }

        // 处理角色数据格式
        processCharacters(charactersData) {
            return charactersData.map(character => {
                if (!character.id || !character.name) return null;

                const mode = character.gameMode === 'standard' ? this.getText('standard') :
                    character.gameMode === 'ironcow' ? this.getText('ironcow') : '';
                const displayText = mode ? `${mode}(${character.name})` : character.name;

                return {
                    id: character.id,
                    name: character.name,
                    mode, gameMode: character.gameMode,
                    link: `${window.location.origin}/game?characterId=${character.id}`,
                    displayText
                };
            }).filter(Boolean);
        }

        // 带缓存的角色数据获取
        async getCharacters() {
            if (this.isLoadingCharacters) {
                while (this.isLoadingCharacters) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                return this.charactersCache || [];
            }
            if (this.charactersCache) return this.charactersCache;

            this.isLoadingCharacters = true;
            try {
                const charactersData = await this.fetchCharactersFromAPI();
                this.charactersCache = this.processCharacters(charactersData);
                return this.charactersCache;
            } catch (error) {
                console.log('获取角色数据失败:', error);
                return [];
            } finally {
                this.isLoadingCharacters = false;
            }
        }

        // 预加载角色数据
        async preloadCharacters() {
            try {
                await this.getCharacters();
            } catch (error) {
                console.log('预加载角色数据失败:', error);
            }
        }

        // 清除缓存
        clearCache() {
            this.charactersCache = null;
        }

        // 为头像添加点击事件
        addAvatarClickHandler() {
            const avatar = document.querySelector(this.config.avatarSelector);
            if (!avatar || avatar.hasAttribute('data-character-switch-added')) return;

            avatar.setAttribute('data-character-switch-added', 'true');
            avatar.style.cursor = 'pointer';
            avatar.title = 'Click to switch character';

            const mouseenterHandler = () => {
                Object.assign(avatar.style, {
                    backgroundColor: 'var(--item-background-hover)',
                    borderColor: 'var(--item-border-hover)',
                    boxShadow: '0 0 8px rgba(152, 167, 233, 0.5)',
                    transition: 'all 0.2s ease'
                });
            };

            const mouseleaveHandler = () => {
                Object.assign(avatar.style, {
                    backgroundColor: '', borderColor: '', boxShadow: ''
                });
            };

            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown();
            };

            avatar.addEventListener('mouseenter', mouseenterHandler);
            avatar.addEventListener('mouseleave', mouseleaveHandler);
            avatar.addEventListener('click', clickHandler);

            // 存储事件处理器以便后续移除
            avatar._characterSwitchHandlers = { mouseenterHandler, mouseleaveHandler, clickHandler };
        }

        // 移除头像事件监听器
        removeEventListeners() {
            const avatar = document.querySelector(this.config.avatarSelector);
            if (avatar && avatar._characterSwitchHandlers) {
                const { mouseenterHandler, mouseleaveHandler, clickHandler } = avatar._characterSwitchHandlers;
                avatar.removeEventListener('mouseenter', mouseenterHandler);
                avatar.removeEventListener('mouseleave', mouseleaveHandler);
                avatar.removeEventListener('click', clickHandler);
                avatar.removeAttribute('data-character-switch-added');
                delete avatar._characterSwitchHandlers;
            }
        }

        // 切换下拉菜单显示/隐藏
        toggleDropdown() {
            const existing = document.querySelector('#character-switch-dropdown');
            if (existing) {
                this.closeDropdown();
            } else {
                this.createDropdown();
            }
        }

        // 关闭下拉菜单
        closeDropdown() {
            const existing = document.querySelector('#character-switch-dropdown');
            if (existing) {
                existing.remove();
            }
        }

        // 创建角色切换下拉菜单
        async createDropdown() {
            const avatar = document.querySelector(this.config.avatarSelector);
            if (!avatar) return;

            // 创建下拉容器
            const dropdown = document.createElement('div');
            dropdown.id = 'character-switch-dropdown';
            Object.assign(dropdown.style, {
                position: 'absolute', top: '100%', right: '0',
                backgroundColor: 'rgba(30, 30, 50, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px', padding: '8px',
                minWidth: '280px', maxWidth: '400px', maxHeight: '400px',
                overflowY: 'auto', backdropFilter: 'blur(10px)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                zIndex: '9999', marginTop: '5px'
            });

            const title = document.createElement('div');
            title.textContent = this.getText('switchCharacter');
            Object.assign(title.style, {
                color: 'rgba(255, 255, 255, 0.9)', fontSize: '14px', fontWeight: 'bold',
                padding: '8px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '8px'
            });
            dropdown.appendChild(title);

            // 将下拉菜单添加到页面
            const characterInfo = document.querySelector(this.config.characterInfoSelector);
            if (characterInfo) {
                characterInfo.style.position = 'relative';
                characterInfo.appendChild(dropdown);
            }

            // 显示加载状态（如果需要）
            if (!this.charactersCache) {
                const loadingMsg = document.createElement('div');
                loadingMsg.className = 'loading-indicator';
                loadingMsg.textContent = 'Loading...';
                Object.assign(loadingMsg.style, {
                    color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px',
                    padding: '8px 12px', textAlign: 'center', fontStyle: 'italic'
                });
                dropdown.appendChild(loadingMsg);
            }

            try {
                // 获取角色数据并渲染
                const characters = await this.getCharacters();
                const loadingMsg = dropdown.querySelector('.loading-indicator');
                if (loadingMsg) loadingMsg.remove();

                // 无数据时显示提示
                if (characters.length === 0) {
                    const noDataMsg = document.createElement('div');
                    noDataMsg.textContent = this.getText('noCharacterData');
                    Object.assign(noDataMsg.style, {
                        color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px',
                        padding: '8px 12px', textAlign: 'center', fontStyle: 'italic'
                    });
                    dropdown.appendChild(noDataMsg);
                    return;
                }

                this.renderCharacterButtons(dropdown, characters);
            } catch (error) {
                // 错误处理
                const loadingMsg = dropdown.querySelector('.loading-indicator');
                if (loadingMsg) loadingMsg.remove();

                const errorMsg = document.createElement('div');
                errorMsg.textContent = 'Failed to load character data';
                Object.assign(errorMsg.style, {
                    color: 'rgba(255, 100, 100, 0.8)', fontSize: '12px',
                    padding: '8px 12px', textAlign: 'center', fontStyle: 'italic'
                });
                dropdown.appendChild(errorMsg);
            }

            this.setupDropdownCloseHandler(dropdown, avatar);
        }

        // 渲染角色按钮
        renderCharacterButtons(dropdown, characters) {
            // 按钮样式配置
            const buttonStyle = {
                padding: '8px 12px', backgroundColor: 'rgba(48, 63, 159, 0.2)',
                color: 'rgba(255, 255, 255, 0.9)', border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '4px', fontSize: '13px', cursor: 'pointer',
                display: 'block', width: '100%', textDecoration: 'none',
                marginBottom: '4px', transition: 'all 0.2s ease', textAlign: 'left'
            };

            const hoverStyle = {
                backgroundColor: 'rgba(26, 35, 126, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.3)'
            };

            const currentCharacterId = this.getCurrentCharacterId();

            // 为每个角色创建按钮
            characters.forEach(character => {
                if (!character) return;

                const isCurrentCharacter = currentCharacterId === character.id.toString();
                const characterButton = document.createElement('a');

                Object.assign(characterButton.style, buttonStyle);
                characterButton.href = character.link;
                characterButton.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: ${isCurrentCharacter ? 'bold' : 'normal'};">
                            ${character.displayText || character.name || 'Unknown'}
                        </div>
                        <div style="font-size: 11px; opacity: 0.7;">ID: ${character.id}</div>
                    </div>
                    <div style="font-size: 11px; color: ${isCurrentCharacter ? '#2196F3' : '#4CAF50'};">
                        ${isCurrentCharacter ? this.getText('current') : this.getText('switch')}
                    </div>
                </div>
            `;

                if (isCurrentCharacter) {
                    Object.assign(characterButton.style, {
                        backgroundColor: 'rgba(33, 150, 243, 0.2)',
                        borderColor: 'rgba(33, 150, 243, 0.4)'
                    });
                }

                const hoverStyles = isCurrentCharacter ?
                    { backgroundColor: 'rgba(33, 150, 243, 0.3)', borderColor: 'rgba(33, 150, 243, 0.6)' } :
                    hoverStyle;

                const normalStyles = isCurrentCharacter ?
                    { backgroundColor: 'rgba(33, 150, 243, 0.2)', borderColor: 'rgba(33, 150, 243, 0.4)' } :
                    buttonStyle;

                characterButton.addEventListener('mouseover', () => Object.assign(characterButton.style, hoverStyles));
                characterButton.addEventListener('mouseout', () => Object.assign(characterButton.style, normalStyles));

                dropdown.appendChild(characterButton);
            });
        }

        // 设置下拉菜单关闭处理
        setupDropdownCloseHandler(dropdown, avatar) {
            const closeHandler = (e) => {
                if (!dropdown.contains(e.target) && !avatar.contains(e.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };

            setTimeout(() => document.addEventListener('click', closeHandler), 100);
        }

        // DOM变化时刷新
        refresh() {
            try {
                this.addAvatarClickHandler();
            } catch (error) {
                console.log('刷新函数出错:', error);
            }
        }

        // 设置事件监听器
        setupEventListeners() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.refresh());
            } else {
                this.refresh();
            }
        }

        // 开始DOM观察器
        startObserver() {
            const config = { attributes: true, childList: true, subtree: true };
            this.observer = new MutationObserver(() => this.refresh());
            this.observer.observe(document, config);
        }
    }

    
    const characterSwitcher = new CharacterSwitcher();

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
                resolve();
            } catch (error) {
                console.error('%c[MWI-Enhanced] 界面注入失败:', 'color: #F44336; font-weight: bold;', error);
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