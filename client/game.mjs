let turns = [];
let pirates;
let lastAction;
let state;

class GameState {
    constructor(gameState, levelMap) {
        this.goodsInPort = copyObj(gameState.goodsInPort);
        this.ports = gameState.ports;
        this.prices = gameState.prices;
        this.homePort = this.findHomePort();
        this.shipCapacity = 368;
        this.totalTurns = 179;
        this.numberOfActionsInTrip = 2;
        this.directions = {
            N: {x: 0, y: -1},
            S: {x: 0, y: 1},
            W: {x: 1, y: 0},
            E: {x: -1, y: 0}
        };
        this.reverseDirections = {
            N: 'S',
            S: 'N',
            W: 'E',
            E: 'W',
        };
        this.tiles = {
            earth: '#',
            sea: '~',
            port: 'O',
            home: 'H',
        };
        this.options = [
            'nothing',
            'nextForOptimalSales',
            'nextForCurrentPort'
        ];
        this.portBuyerIDs = this.getPortBuyerIDs();
        this.paths = getPathsBetweenPorts(levelMap, this);
        this.unitPrices = this.sortByPort(this.getUnitPrices());
        this.unitPerTurnPrices = this.getUnitPerTurnPrices();
        this.optimalSales = this.getOptimalSales();
        //strategies: [trips: [trip: [actions: {},],],]
        this.strategies = [[[{
            productName: '',
            amount: 0,
            portFrom: this.homePort,
            portTo: this.homePort,
            goodsInPort: [...this.goodsInPort],
            shipCapacityRemaining: this.shipCapacity,
            turns: 0,
            income: 0,
            keepGoing: true,
        }]]];
    }

    findHomePort() {
        return this.ports.find(port => port.isHome).portId
    }

    getUnitPrices() {
        let unitPrices = {};
        for (let price of this.prices) {
            let pricesForPort = [];
            for (let product of this.goodsInPort) {
                pricesForPort.push({
                    name: product.name,
                    price: price[product.name] ?  price[product.name] / product.volume : 0
                })
            }
            unitPrices[price.portId] = pricesForPort
        }
        return unitPrices
    }

    getUnitPerTurnPrices() {
        let unitPerTurnPrices = {};
        for (let portToId of this.portBuyerIDs) {
            let pricesUnitPerTurn = [];
            for (let product of this.unitPrices[portToId]) {
                pricesUnitPerTurn.push({
                    name: product.name,
                    price: product.price / this.paths[this.homePort][portToId].length
                })
            }
            unitPerTurnPrices[portToId] = pricesUnitPerTurn;
        }
        return unitPerTurnPrices
    }

    getOptimalSales() {
        let optimalSales = this.goodsInPort.reduce((accum, product) => {
            let maxPriceForPort = {name: '', price: 0};
            let maxPricePortId = -1;
            for (let portId in this.unitPerTurnPrices) {
                if (this.unitPerTurnPrices.hasOwnProperty(portId)) {
                    let priceForPort = this.unitPerTurnPrices[portId].find(priceForPort => product.name===priceForPort.name);
                    if (priceForPort.price > maxPriceForPort.price) {
                        maxPriceForPort = priceForPort;
                        maxPricePortId = portId
                    }
                }
            }
            return accum.concat([{name: maxPriceForPort.name, portId: maxPricePortId}])
        }, []);
        optimalSales.sort((a, b) => {
            let bPrice = this.unitPerTurnPrices[b.portId].find(pr => pr.name===b.name).price;
            let aPrice = this.unitPerTurnPrices[a.portId].find(pr => pr.name===a.name).price;
            return bPrice - aPrice
        });
        return optimalSales
    }

    sortByPort(unitPrices) {
        for (let portId in unitPrices) {
            if (unitPrices.hasOwnProperty(portId)) {
                let pricesForPort = unitPrices[portId];
                pricesForPort.sort((a, b) => b.price - a.price);
            }
        }
        return unitPrices
    }

    getPortBuyerIDs() {
        let portBuyerIDs = [];
        this.ports.forEach(port => {
            if (!port.isHome) portBuyerIDs.push(port.portId)
        });
        return portBuyerIDs
    }


}

export function startGame(levelMap, gameState) {
    state = new GameState(gameState, levelMap);
    let optimalTrips = getOptimalTrips(state);
    turns = buildSequenceOfTurns(optimalTrips, state);
}

function getPathsBetweenPorts(levelMap, state) {
    let paths = {};

    for (let portFrom of state.ports) {
        for (let portTo of state.ports) {
            if (!paths[portFrom.portId]) paths[portFrom.portId] = {};
            if (!paths[portTo.portId]) paths[portTo.portId] = {};

            if (!paths[portFrom.portId][portTo.portId]) {
                let path = createPathBetweenPorts(portFrom, portTo, levelMap, state);

                paths[portFrom.portId][portTo.portId] = path;
                paths[portTo.portId][portFrom.portId] = reversePath(path, state);
            }
        }
    }
    return paths
}

function reversePath(path, state) {
    let revPath =[];
    
    for (let direction of path) {
        revPath.push(state.reverseDirections[direction])
    }
    return revPath.reverse()
}

function createPathBetweenPorts(portFrom, portTo, levelMap, state) {
    const pointPortFrom = new Point(portFrom.x, portFrom.y);
    const pointPortTo = new Point(portTo.x, portTo.y);
    return aStar(pointPortFrom, pointPortTo, levelMap, state)
}

function aStar(start, goal, levelMap, state) {
    let directions = [
        {'x': -1, 'y': 0},
        {'x': 1, 'y': 0},
        {'x': 0, 'y': -1},
        {'x': 0, 'y': 1}
    ];
    let viewed = [];
    let needToView = [];
    needToView.push(start);
    start.distanceToStart = 0;
    start.pathLength = start.distanceToStart + start.heuristic(goal);

    while (needToView.length !== 0) {
        let current = pointMinPathLength(needToView);
        if (current.isEqual(goal)) return collectPath(start, current);
        current.removeFrom(needToView);
        viewed.push(current);

        for (let direction of directions) {
            let neighborPoint = new Point(current.x + direction.x, current.y + direction.y);
            let tentativeScore = current.distanceToStart + 1;
            let mP = neighborPoint.mapPoint(levelMap);

            if ((mP === state.tiles.sea) || (mP === state.tiles.port) || (mP === state.tiles.home)) {
                if ((neighborPoint.belong(viewed)) && (tentativeScore >= neighborPoint.distanceToStart))
                    continue;
                if ((!neighborPoint.belong(viewed)) || (tentativeScore < neighborPoint.distanceToStart)) {
                    neighborPoint.parent = current;
                    neighborPoint.distanceToStart = tentativeScore;
                    neighborPoint.pathLength =  neighborPoint.distanceToStart + neighborPoint.heuristic(goal);
                    if (!neighborPoint.belong(needToView)) needToView.push(neighborPoint)
                }
            }
        }
    }
    return false
}

function pointMinPathLength(points) {
    let min = Infinity;
    let out;

    for (let point of points) {
        if (point.pathLength < min) {
            min = point.pathLength;
            out = point
        }
    }
    return out
}

function collectPath(start, goal) {
    let path = [];
    let point = goal;
    while (!point.isEqual(start)) {
        path.push(point.locationRelativeTo(point.parent));
        point = point.parent
    }
    return path.reverse()
}

function copyObj(obj) {
    return JSON.parse(JSON.stringify(obj))
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.pathLength = 0;
        this.distanceToStart = 0;
        this.parent = [];
    }

    mapPoint(levelMap) {
        let map_width = levelMap.indexOf('\n');
        let posPointInStr = this.y*map_width + this.y + this.x;
        return levelMap[posPointInStr]
    }

    isEqual(point) {
        return ((this.x === point.x) && (this.y === point.y))
    }

    belong(points) {
        return points.find(point => (point.x === this.x && point.y === this.y))
    }

    removeFrom(points) {
        for (let i=0; i<points.length; i++) {
            if (this.isEqual(points[i])) {
                points.splice(i, 1);
                return
            }
        }
    }

    locationRelativeTo(point) {
        if (this.x !== point.x) {
            return this.x > point.x ? 'E' : 'W';
        }
        else {
            return this.y > point.y ?'S' : 'N'
        }
    }

    heuristic(goal) {
        return Math.abs(this.x - goal.x) + Math.abs(this.y - goal.y)
    }
}

//______________________________________________________________________________________________________________________

function getOptimalTrips(state) {
    let strategies = state.strategies;

    strategies = getAllStrategies(strategies);
    console.log(strategies);
    // console.log(JSON.stringify(strategies, null, '\t'));

    strategies = deleteLastActions(strategies, state);

    strategies = deleteLastHomeReturns(strategies);

    strategies = strategies.reduce((accum, trips) => {
        accum.push(fillFreeSpace(trips, state));
        return accum
    }, []);

    let bestStrategy =  strategies.reduce((accum, trips) => {
        let lastTripAccum = accum[accum.length - 1];
        let lastActionAccum = lastTripAccum[lastTripAccum.length - 1];
        let lastTrip = trips[trips.length - 1];
        let lastAction = lastTrip[lastTrip.length - 1];
        if (lastAction.income > lastActionAccum.income) return trips;
        return accum
    });

    console.log(bestStrategy);

    return bestStrategy
}

function getAllStrategies(strategies) {
    let keepGoing = true;

    while (keepGoing) {
        strategies = addFirstActionToTrips(strategies, state);

        for (let i=1; i<state.numberOfActionsInTrip; i++) {
            strategies = addSomeActionForTrips(strategies, state);
        }

        strategies = addHomeActionToTrips(strategies, state);

        keepGoing = strategies.reduce((accum, trips) => {
            let lastTrip = trips[trips.length-1];
            let lastAction = lastTrip[lastTrip.length-1];
            return accum || (lastAction.keepGoing)
        }, false);
    }

    return strategies
}

function deleteLastActions(strategies, state) {
    strategies.forEach(trips => {
        let lastTrip = trips[trips.length-1];
        let lastAction = lastTrip[lastTrip.length-1];
        if (lastAction.turns > state.totalTurns) lastTrip.pop();
        if (lastTrip.length===0) trips.pop()
    });
    return strategies
}

function deleteLastHomeReturns(strategies) {
    strategies.forEach(trips => {
        let lastTrip = trips[trips.length-1];
        if (lastTrip.length!==1) lastTrip.pop()
    });
    return strategies
}

function addFirstActionToTrips(strategies, state) {
    for (let trips of strategies) {
        let lastTrip = trips[trips.length-1];
        let lastAction = lastTrip[lastTrip.length-1];

        if (lastAction.keepGoing) {
            let nextAction = createFirstActionInTrip(lastTrip, state);
            if (nextAction.length!==0) trips.push(nextAction);
        }
    }
    return strategies
}

function addSomeActionForTrips(strategies, state) {
    return strategies.reduce((accum, trips) => {
        let lastTrip = trips[trips.length-1];
        let lastAction = lastTrip[lastTrip.length-1];

        if (lastAction.keepGoing) {
            state.options.forEach((option) => {
                let nextAction = optionInterpret(option, lastTrip, state);
                let newTrips = [...trips];
                newTrips.pop();
                newTrips.push(lastTrip.concat(nextAction));
                if (!accum.find(trips => JSON.stringify(trips)===JSON.stringify(newTrips))) {
                    accum.push(newTrips);
                }
            });
            return accum
        }
        accum.push(trips);
        return accum
    }, []);
}

function addHomeActionToTrips(strategies, state) {
    for (let trips of strategies) {
        let lastTrip = trips[trips.length-1];
        let lastAction = lastTrip[lastTrip.length-1];

        if (lastAction.keepGoing) {
            let nextAction = createActionForHome(lastTrip, state);
            lastTrip.push(nextAction)
        }
    }
    return strategies
}

function optionInterpret(option, trip, state) {
    switch (option) {
        case 'nothing':
            return [];
        case 'nextForOptimalSales':
            return createActionForOptimalSales(trip, state);
        case 'nextForCurrentPort':
            return createActionForCurrentPort(trip, state);
    }
}

function createActionForOptimalSales(trip, state) {
    let nextAction = {};
    let lastAction = trip[trip.length-1];
    let goodsInPort = [...lastAction.goodsInPort];
    nextAction.portFrom = lastAction.portTo;
    let product = {};
    let nextProductOptimalSales = state.optimalSales.find(productOptimalSales => {
        product = goodsInPort.find(pr => {
            return pr.name === productOptimalSales.name
        });
        return product ? product.amount : product
    });
    if (!nextProductOptimalSales) {
        lastAction.keepGoing = false;
        return []
    }
    nextAction.portTo = parseInt(nextProductOptimalSales.portId);
    nextAction = fillSameProperties(nextAction, lastAction, product, goodsInPort, state);
    if (nextAction.amount === 0) return [];
    return [nextAction]
}

function createActionForCurrentPort(trip, state) {
    let lastAction = trip[trip.length-1];
    let nextAction = {};
    let goodsInPort = [...lastAction.goodsInPort];
    nextAction.portFrom = lastAction.portTo;
    nextAction.portTo = parseInt(nextAction.portFrom);
    let product = {};
    let nextProductCurrentPort = state.optimalSales.find(productOptimalSales => {
        product = goodsInPort.find(pr => {
            return pr.name === productOptimalSales.name
        });
        return product ? product.amount : product
    });
    if (!nextProductCurrentPort) return [];
    nextAction = fillSameProperties(nextAction, lastAction, product, goodsInPort, state);
    if (nextAction.amount === 0) return [];
    return [nextAction]
}

function fillSameProperties(nextAction, lastAction, product, goodsInPort, state) {
    nextAction.amount = Math.min(
        product.amount,
        Math.floor(lastAction.shipCapacityRemaining/product.volume)
    );
    nextAction.productName = product.name;
    nextAction.goodsInPort = copyObj(goodsInPort);
    nextAction.goodsInPort.find(pr => pr.name===product.name).amount -= nextAction.amount;
    nextAction.shipCapacityRemaining = lastAction.shipCapacityRemaining - nextAction.amount*product.volume;
    nextAction.turns = lastAction.turns + 2 + state.paths[nextAction.portFrom][nextAction.portTo].length;
    nextAction.income = lastAction.income +
        nextAction.amount*(state.prices.find(price => price.portId===parseInt(nextAction.portTo)))[product.name];
    nextAction.keepGoing = nextAction.turns < state.totalTurns;
    return nextAction
}

function createActionForHome(trip, state) {
    let nextAction = {};
    let lastAction = trip[trip.length-1];

    nextAction.portFrom = lastAction.portTo;
    nextAction.portTo = state.homePort;
    nextAction.productName = '';
    nextAction.amount = 0;
    nextAction.goodsInPort = lastAction.goodsInPort;
    nextAction.shipCapacityRemaining = state.shipCapacity;
    nextAction.turns = lastAction.turns + state.paths[nextAction.portFrom][nextAction.portTo].length;
    nextAction.income = lastAction.income;
    nextAction.keepGoing = nextAction.turns < state.totalTurns;
    return nextAction
}

function createFirstActionInTrip(trip, state) {
    let nextAction = {};
    let lastAction = trip[trip.length-1];
    let goodsInPort = [...lastAction.goodsInPort];
    nextAction.portFrom = lastAction.portTo;
    let product = {};
    let nextProductOptimalSales = state.optimalSales.find(productOptimalSales => {
        product = goodsInPort.find(pr => pr.name === productOptimalSales.name);
        return product.amount
    });
    if (!nextProductOptimalSales) {
        lastAction.keepGoing = false;
        return []
    }
    nextAction.portTo = parseInt(nextProductOptimalSales.portId);
    nextAction = fillSameProperties(nextAction, lastAction, product, goodsInPort, state);
    if (nextAction.amount === 0) return [];
    return [nextAction]
}

function fillFreeSpace(trips, state) {
    let lastTrip = trips[trips.length-1];
    let lastActionLastTrip = lastTrip[lastTrip.length-1];
    let turnsRemaining = state.totalTurns - lastActionLastTrip.turns;
    let actionsRemaining = Math.floor(turnsRemaining/2);


    for (actionsRemaining; actionsRemaining>0; actionsRemaining--) {
        let topTripNumber = getTopTripNumber(trips);
        if (!topTripNumber) break;

        let topTrip = trips[topTripNumber];

        let lastActionTopTrip = topTrip[topTrip.length-1];
        if (lastActionTopTrip.productName==='') lastActionTopTrip = topTrip[topTrip.length-2];

        let possibleActions = getPossibleActions(topTrip, lastActionTopTrip, lastActionLastTrip);
        if (possibleActions.length===0) break;

        let topActionTopTrip = getTopActionTopTrip(possibleActions);
        let topActionNumber = getTopActionNumber(topActionTopTrip, topTrip);

        let builtTopAction = buildTopAction(topActionTopTrip, topTrip[topActionNumber-1]);
        trips = rebuildTrips(copyObj(trips), topTripNumber, topActionTopTrip, topActionNumber, builtTopAction);

        lastTrip = trips[trips.length-1];
        lastActionLastTrip = lastTrip[lastTrip.length-1];
    }
    return trips
}

function getTopTripNumber(trips) {
    let numberTrip;
    let maxShipCapacityRemaining = 0;
    for (let number in trips) {
        if (trips.hasOwnProperty(number) && number>0) {
            let trip = trips[number];
            let lastAction = trip[trip.length-1];
            if (lastAction.productName==='') lastAction = trip[trip.length-2];
            if (lastAction.shipCapacityRemaining > maxShipCapacityRemaining) {
                maxShipCapacityRemaining = lastAction.shipCapacityRemaining;
                numberTrip = number
            }
        }
    }
    return numberTrip
}

function getPossibleActions(topTrip, lastActionTopTrip, lastActionLastTrip) {
    return topTrip.reduce((accum, action) => {
        let product = {};
        let shipCapacityRemaining = lastActionTopTrip.shipCapacityRemaining;
        let portId = action.portTo;
        let productAmount = 0;
        if (portId!==0) {
            let unitPricesProduct = state.unitPrices[portId].find(unitPriceProduct => {
                product = lastActionLastTrip.goodsInPort.find(pr => unitPriceProduct.name === pr.name);
                productAmount = Math.min(
                    product.amount,
                    Math.floor(shipCapacityRemaining/product.volume)
                );
                return productAmount
            });
            if (!unitPricesProduct) return accum;
            let productIncome = productAmount*unitPricesProduct.price*product.volume;

            accum.push({
                name: product.name,
                amount: productAmount,
                portId: portId,
                shipCapacity:productAmount*product.volume,
                income: productIncome
            });
        }
        return accum
    }, [])
}

function getTopActionTopTrip(possibleActions) {
    let topActionTopTrip = {};
    let maxIncome = 0;
    possibleActions.forEach(possibleAction => {
        if (possibleAction.income > maxIncome) {
            maxIncome = possibleAction.income;
            topActionTopTrip = possibleAction
        }
    });
    return topActionTopTrip
}

function getTopActionNumber(topActionTopTrip, topTrip) {
    for (let actionNumber in topTrip) {
        if (topTrip.hasOwnProperty(actionNumber)) {
            let action = topTrip[actionNumber];
            if (action.portTo===topActionTopTrip.portId) {
                actionNumber++;
                return actionNumber
            }
        }
    }
}

function buildTopAction(topActionTopTrip, beforeTopAction) {
    let nextAction = {};
    nextAction.productName = topActionTopTrip.name;
    nextAction.amount = topActionTopTrip.amount;
    nextAction.portFrom = topActionTopTrip.portId;
    nextAction.portTo = topActionTopTrip.portId;
    nextAction.goodsInPort = copyObj(beforeTopAction.goodsInPort);
    nextAction.goodsInPort.find(pr => pr.name===topActionTopTrip.name).amount -= nextAction.amount;
    nextAction.shipCapacityRemaining = beforeTopAction.shipCapacityRemaining - topActionTopTrip.shipCapacity;
    nextAction.turns = beforeTopAction.turns + 2;
    nextAction.income = beforeTopAction.income + topActionTopTrip.income;
    nextAction.keepGoing = true;
    return nextAction
}

function rebuildTrips(trips, topTripNumber, topActionTopTrip, topActionNumber, builtTopAction) {
    trips[topTripNumber].splice(topActionNumber, 0, builtTopAction);
    for (let i=topTripNumber; i<trips.length; i++) {
        let trip = trips[i];
        for (let j=0; j<trip.length; j++) {
            if (i>topTripNumber || j>topActionNumber) {
                let action = trip[j];
                let isTopTrip = i===topTripNumber;
                trip[j] = rebuildAction(action, topActionTopTrip, isTopTrip)
            }
        }
    }
    return trips
}

function rebuildAction(action, topActionTopTrip, isTopTrip) {
    let rebuiltAction = action;
    rebuiltAction.goodsInPort = copyObj(action.goodsInPort);
    rebuiltAction.goodsInPort.find(pr => pr.name===topActionTopTrip.name).amount -= topActionTopTrip.amount;
    if (isTopTrip && action.productName!=='') {
        rebuiltAction.shipCapacityRemaining = action.shipCapacityRemaining - topActionTopTrip.shipCapacity;
    }
    rebuiltAction.turns = action.turns + 2;
    rebuiltAction.income = action.income + topActionTopTrip.income;
    return rebuiltAction
}

function buildSequenceOfTurns(trips, state) {
    let tripsSequence = [];
    let lastTrip = trips[trips.length-1];
    let lastAction = lastTrip[lastTrip.length-1];
    let unusedTurns = state.totalTurns - lastAction.turns;

    for (let trip of trips) {
        for (let action of trip) {
            if (action.productName!=='')
                tripsSequence.push(`LOAD ${action.productName} ${action.amount}`)
        }

        for (let action of trip) {
            for (let directionOfTurn of state.paths[action.portFrom][action.portTo]) {
                tripsSequence.push(directionOfTurn)
            }
            if (action.productName!=='')
                tripsSequence.push(`SELL ${action.productName} ${action.amount}`)
        }
    }

    while (unusedTurns > 0) {
        tripsSequence.push(`WAIT`);
        unusedTurns--
    }
    return tripsSequence.reverse()
}

//______________________________________________________________________________________________________________________

export function getNextCommand(gameState) {
    let nextAction = [...turns].pop();
    if (state.directions[nextAction]) {
        let ship = gameState.ship;
        let nextShipPos = {
            x: ship.x + state.directions[nextAction].x,
            y: ship.y + state.directions[nextAction].y
        };
        pirates = gameState.pirates;
        for (let pirate of pirates) {
            if ((pirate.x === nextShipPos.x) && (pirate.y === nextShipPos.y)) {
                turns.push(lastAction);
                turns.push(state.reverseDirections[lastAction])
            }
            for (let d in state.directions) {
                if (pirate.x + state.directions[d].x === ship.x && pirate.y + state.directions[d].y === ship.y) {
                    turns.push(lastAction);
                    turns.push(state.reverseDirections[lastAction])
                }
            }
        }
    }
    lastAction = nextAction;
    return turns.pop();
}


