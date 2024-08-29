var width = 960;
var height = 600;

const nbr_loading_batchsize = 5;

var allNodes = [], allLinks = [], allNbrsById = {};

function initRandomGraph(full_node_count, full_link_count) {
    allNodes = Array.from({ length: full_node_count }, (_, i) => ({ id: `n${i}` }));
    allLinks = Array.from({ length: full_link_count }, () => {
        let src = Math.floor(Math.random() * (full_node_count - 1));
        let tgt = Math.floor(Math.random() * (full_node_count - 1));
        if (src > tgt) [src, tgt] = [tgt, src];
        tgt = tgt + 1;

        return { id: `e_${src}_${tgt}`, source: allNodes[src], target: allNodes[tgt] };
    });

    finishGraphInit();
}

function initStarGraph(node_count) {
    allNodes = Array.from({ length: node_count }, (_, i) => ({ id: `n${i}` }));
    allLinks = Array.from({ length: node_count - 1 }, (_, i) => {
        return { id: `e_0_${i+1}`, source: allNodes[0], target: allNodes[i + 1] };
    });

    finishGraphInit();
}

let loadedNodes = {}, loadedLinksAdjlist = {}, loadedLinks = {};

function loadInitialGraph(seedNodes, target_nodecount_to_load) {
    let nodeQueue = [...seedNodes];
    let nodesProcessed = 0;
    let nbrsExcluded = new Set();

    while (nodeQueue.length > 0 || (nodesProcessed < target_nodecount_to_load && Object.keys(loadedNodes).length < Object.keys(allNodes).length)) {
        if (nodeQueue.length === 0) {
            const chosenIndex = 0;//Math.floor(Math.random() * allNodes.length);
            for (let i = 0; i < allNodes.length; i++) {
                const curChosen = allNodes[(chosenIndex + i) % allNodes.length];
                if (!loadedNodes[curChosen.id] && !nbrsExcluded.has(curChosen.id)) {
                    nodeQueue.push(curChosen);
                    break;
                }
            }
        }

        if (nodeQueue.length === 0) break;

        const currentNode = nodeQueue.shift();
        if (loadedNodes[currentNode.id]) continue;

        addToLoadedNodes(currentNode);
        nodesProcessed++;

        const neighbors = allNbrsById[currentNode.id];
        const alreadyLoadedNeighbors = neighbors.filter(nbhood => loadedNodes[nbhood.n.id]);
        const nbrsStillNotLoaded = neighbors.filter(nbhood => !loadedNodes[nbhood.n.id]);
        permute(nbrsStillNotLoaded);

        alreadyLoadedNeighbors.forEach(nbhood => addToLoadedLinks(nbhood.l));

        const remainingGlobalCapacity = target_nodecount_to_load - nodesProcessed;
        const willLoadTheseManyMore = Math.min(nbr_loading_batchsize, remainingGlobalCapacity, nbrsStillNotLoaded.length);
        const selectedNotLoadedNeighbors = nbrsStillNotLoaded.slice(0, willLoadTheseManyMore);

        selectedNotLoadedNeighbors.forEach(nbhood => {
            addToLoadedNodes(nbhood.n);
            addToLoadedLinks(nbhood.l);
            nodeQueue.push(nbhood.n);
        });

        nbrsStillNotLoaded.slice(willLoadTheseManyMore).forEach(nbhood => nbrsExcluded.add(nbhood.n.id));
        manageLoadMoreNode(currentNode, nbrsStillNotLoaded.length - willLoadTheseManyMore);
    }
}

function manageLoadMoreNode(currentNode, numOfNbrsStillNotLoaded) {
    const moreNodeId = "more_" + currentNode.id;
    const moreLinkId = `link_${currentNode.id}_${moreNodeId}`;

    if (numOfNbrsStillNotLoaded > 0) {
        const moreNodeLabel = `${numOfNbrsStillNotLoaded} more`;
        let moreNode = loadedNodes[moreNodeId];
        if (!moreNode) {
            moreNode = { id: moreNodeId, name: moreNodeLabel, parentNodeId: currentNode.id };
            addToLoadedNodes(moreNode);

            const moreLink = { id: moreLinkId, source: currentNode, target: moreNode, virtual: true };
            addToLoadedLinks(moreLink);
        } else {
            moreNode.name = moreNodeLabel;
        }
    } else {
        if (loadedNodes[moreNodeId]) {
            delete loadedNodes[moreNodeId];
            delete loadedLinksAdjlist[currentNode.id][moreNodeId];
            delete loadedLinks[moreLinkId];
        }
    }
}

function loadMoreNeighborsClicked(d) {
    const currentNode = loadedNodes[d.parentNodeId];
    if (!currentNode) return;

    const neighbors = allNbrsById[currentNode.id];
    const nbrsStillNotLoaded = neighbors.filter(nbhood => !loadedNodes[nbhood.n.id]);
    const willLoadTheseManyMore = Math.min(nbrsStillNotLoaded.length, nbr_loading_batchsize);

    const selectedNotLoadedNeighbors = nbrsStillNotLoaded.slice(0, willLoadTheseManyMore);
    selectedNotLoadedNeighbors.forEach(nbhood => {
        addToLoadedNodes(nbhood.n);
        addToLoadedLinks(nbhood.l);
        Object.values(allLinks).forEach(link => {
            other = (nbhood.l.source == nbhood.n) ? nbhood.l.target : nbhood.l.source;
            if (link.source == nbhood.n && loadedNodes[other] && !loadedLinks[link.id]) {
                addToLoadedLinks(link);
            }
        })
        if (selectedNode == currentNode) {
            selectedNeighbors[nbhood.n.id] = nbhood;
        }
    });

    manageLoadMoreNode(currentNode, nbrsStillNotLoaded.length - willLoadTheseManyMore);

    // Hack needed to work around improper rendering of new nodes, when not born selected.
    if (selectedNode != currentNode) {
        oldSelectedNode = selectedNode;

        selectNode(currentNode);
        if (oldSelectedNode == null) {
                deSelectNode();
                deSelectNbrs();
        } else {
                selectNode(oldSelectedNode);
        }
    }
    renderGraph();
    startSimulation();
    simulateNodes([currentNode]);
}

var links = null, nodes = null, simulation = null;
var mySvg = null, panGroup = null, centerCoordsElement = null, zoom = null;

function startSimulation() {
    nodesToSimulate = Object.values(loadedNodes);
    linksToSimulate = Object.values(loadedLinks);

    simulation = d3.forceSimulation(nodesToSimulate)
        .force("link", d3.forceLink(linksToSimulate).id(d => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(30))
        .on("tick", throttle(ticked, 16)); // Throttle the tick event for better performance

    /*
    simulation = d3.forceSimulation(nodesToSimulate)
        .force("link", d3.forceLink(linksToSimulate).id(d => d.id).distance(distanceFunc))
        .force("charge", d3.forceManyBody().strength(strengthFunc))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(15))
        .on("tick", ticked);
    */
}

function renderGraph() {
    mySvg = document.getElementById('mySvg');
    panGroup = document.getElementById('panGroup');
    centerCoordsElement = document.getElementById('centerCoords');

    zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", throttle(zoomed, 50));

    const svg = d3.select(mySvg)
        .attr("width", width)
        .attr("height", height)
        .style("position", "relative")
        .call(zoom)
        .append("g");

    svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "-0 -5 10 10")
        .attr("refX", 13)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 3)
        .attr("markerHeight", 3)
        .attr("xoverflow", "visible")
        .append("svg:path")
        .attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#999")
        .style("stroke", "none");

    const linksData = Object.values(loadedLinks);
    const nodesData = Object.values(loadedNodes);

    links = d3.select(panGroup).selectAll(".link")
        .data(linksData, d => d.id)
        .join(
            enter => enter.append("line")
                .attr("stroke-width", 2)
                .attr("class", "link")
                .style("stroke", getLinkColor)
                .on("click", function(event, l) {
                    selectLink(l);
                    simulateLinks(nbrClosure(l));
                }),
            update => update.style("stroke", getLinkColor),
            exit => exit.remove()
        );

    nodes = d3.select(panGroup).selectAll(".node")
        .data(nodesData, d => d.id)
        .join(
            enter => enter.append("g")
                .attr("class", "node")
                .on("click", function(event, n) {
                    if (n.id.startsWith("more_")) {
                        loadMoreNeighborsClicked(n);
                    } else {
                        selectNode(n);
                    }
                }),
            update => update,
            exit => exit.remove()
        );

    nodes.append("circle")
        .attr("fill", getNodeFillColor)
        .attr("stroke", getNodeStrokeColor)
        .attr("r", 10);

    nodes.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("dy", ".35em")
        .attr("stroke", getNodeTextColor)
        .attr("text-anchor", "middle")
        .style("font-size", "0.33em")
        .text(d => d.name ? d.name : d.id)
        .attr("fill", "deepblue");

    nodes.exit().remove();
}


// Apply stronger repulsive force limited to a certain distance for neighbors
distanceFunc = (l => {
    d = l.virtual ? 30 : (l.source.id in selectedNeighbors || l.target.id in selectedNeighbors ? 50 : 80);
    //console.log("Distance", l.id, d);
    return d;
})
strengthFunc = (l => {
    s = l in selectedNeighbors || l == selectedNode || selectedLink != null && (l == selectedLink.source || l == selectedLink.target) ? 80 : 20;
    //console.log("Strength", l.id, s);
    return s;
});

function simulateNodes(nodes) {
    const nbrClosures = nodes.map(node => nbrClosure(node));
    const nbrhoodLinks = new Set();
    nbrClosures.forEach(node_edges => node_edges.forEach(link => nbrhoodLinks.add(link)));

    return simulateLinks([...nbrhoodLinks]);
}

function nbrClosure(o) {
    let nbrLinks = [];
    if (o.id in loadedLinks) {
        nbrLinks = [o, ...Object.values(loadedLinksAdjlist[o.source.id]), ...Object.values(loadedLinksAdjlist[o.target.id])];
    } else if (o.id in loadedNodes) {
        nbrLinks = Object.values(loadedLinksAdjlist[o.id]);
    }
    return nbrLinks;
}

function simulateLinks(links) {
    simulation.force("link").links(links);
    simulation.alpha(0.3).restart();  // Adjusted alpha target
    zoomToBoundingBox();
}

// Recording current selections.
let selectedNode = null; // Keep track of the currently selected node
let selectedLink = null; // Keep track of the currently selected link
let selectedNeighbors = {}; // Keep track of the selected neighbors
function selectNode(nodeData) {
    toggleToDeSelectCase = selectedNode === nodeData;

    deSelectNode();
    deSelectLink();
    deSelectNbrs();

    if (toggleToDeSelectCase) {
        // updateNodeStyles();
        // updateLinkStyles();
        renderGraph();
        return;
    }

    selectedNode = nodeData;

    // Update selectedNeighbors
    selectedNeighbors = {};
    Object.values(loadedLinksAdjlist[nodeData.id]).forEach(link => {
        const neighbor = link.source === nodeData ? link.target : link.source;
        selectedNeighbors[neighbor.id] = {n: neighbor, l: link};
    });

    renderGraph();
    simulateNodes([nodeData]);
}

function selectLink(linkData) {
    toggleToDeSelectCase = selectedLink === linkData;

    deSelectNode();
    deSelectLink();
    deSelectNbrs();

    if (toggleToDeSelectCase) {
        // updateNodeStyles();
        // updateLinkStyles();
        renderGraph();
        return;
    }

    // Update selectedNeighbors
    selectedNeighbors = {};
    selectedNeighbors[linkData.source.id] = {n: linkData.source, l: linkData};
    selectedNeighbors[linkData.target.id] = {n: linkData.target, l: linkData};

    // Add neighbors of the source node
    Object.values(loadedLinksAdjlist[linkData.source.id]).forEach(link => {
        const neighbor = link.source === linkData.source ? link.target : link.source;
        selectedNeighbors[neighbor.id] = {n: neighbor, l: link};
    });

    // Add neighbors of the target node
    Object.values(loadedLinksAdjlist[linkData.target.id]).forEach(link => {
        const neighbor = link.source === linkData.target ? link.target : link.source;
        selectedNeighbors[neighbor.id] = {n: neighbor, l: link};
    });

    selectedLink = linkData;
    renderGraph();
    simulateLinks(nbrClosure(linkData));
}

function deSelectNode() {
    selectedNode = null;
    renderGraph();
}

function deSelectLink() {
    selectedLink = null;
    renderGraph();
}

function deSelectNbrs() {
    selectedNeighbors = {};
    renderGraph();
}

function ticked() {
    links
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    nodes
        .attr("transform", d => `translate(${d.x},${d.y})`);

    updateCenterCoordinates();
}

const adjustedScaleFactor = 0.4; // Reduce the scale factor to prevent over-zooming
function zoomToBoundingBox() {
    if (selectedNode || selectedLink) {
        setTimeout(() => {
            const xs = new Set(), ys = new Set();

            if (selectedNode) {
                xs.add(selectedNode.x);
                ys.add(selectedNode.y);
            }

            if (selectedLink) {
                xs.add(selectedLink.source.x).add(selectedLink.target.x);
                ys.add(selectedLink.source.y).add(selectedLink.target.y);
            }

            Object.values(selectedNeighbors).forEach(ls => {
                xs.add(ls.n.x);
                ys.add(ls.n.y);
            });

            if (xs.size >= 1) {
                const x0 = d3.min(xs), y0 = d3.min(ys), x1 = d3.max(xs), y1 = d3.max(ys);
                const boxWidth = Math.max(0.1, x1 - x0);
                const boxHeight = Math.max(0.1, y1 - y0);
                const scale = Math.max(0.1, Math.min(8, adjustedScaleFactor * Math.min(width / boxWidth, height / boxHeight)));
                const translateX = (width - scale * (x0 + x1)) / 2;
                const translateY = (height - scale * (y0 + y1)) / 2;

                const transform = d3.zoomIdentity
                    .translate(translateX, translateY)
                    .scale(scale);

                d3.select(mySvg).transition()
                    .duration(1500)
                    .call(zoom.transform, transform)
                    .on("end", () => {
                        updateCenterCoordinates(transform);
                    });
            }
        }, 1000);
    }
}

function updateNodeStyles() {
    d3.selectAll(".node circle")
        .attr("fill", getNodeFillColor)
        .attr("stroke", getNodeStrokeColor);

    d3.selectAll(".node text")
        .attr("stroke", getNodeTextColor);
}

function updateLinkStyles() {
    d3.selectAll(".link")
        .style("stroke", getLinkColor);
}

function addToLoadedNodes(node) {
    if (!loadedNodes[node.id]) {
        loadedNodes[node.id] = node;
        loadedLinksAdjlist[node.id] = {};
    }
}

function addToLoadedLinks(link) {
    addToLoadedNodes(link.source);
    addToLoadedNodes(link.target);

    loadedLinksAdjlist[link.source.id][link.target.id] = link;
    loadedLinksAdjlist[link.target.id][link.source.id] = link;

    loadedLinks[link.id] = link;
}

function updateCenterCoordinates(transform = null) {
    try {
        const svgRect = mySvg.getBoundingClientRect();
        const [centerX, centerY] = transform ? transform.invert([svgRect.width / 2, svgRect.height / 2]) : [width / 2, height / 2];
        centerCoordsElement.textContent = `${Math.round(centerX)}, ${Math.round(centerY)}`;
    } catch (err) {
        console.log("Ignoring error: ", err.message);
    }
}

function getNodeFillColor(n) {
    if (n.id.startsWith("more")) {
        return "white";
    } else if (selectedNode) {
        if (n === selectedNode) {
            return "lightblue";
        } else if (n.id in selectedNeighbors) {
            return "pink";
        }
    } else if (selectedLink && (n === selectedLink.source || n === selectedLink.target) || n.id in selectedNeighbors) {
        return "pink";
    }
    return "lightgreen";
}

function getNodeStrokeColor(n) {
    return n.id.startsWith("more") ? "white" : "black";
}

function getNodeTextColor(n) {
    if (selectedNode && (n === selectedNode || n.id in selectedNeighbors)) {
        return "red";
    } else if (selectedLink && (n === selectedLink.source || n === selectedLink.target) || n.id in selectedNeighbors) {
        return "red";
    } else {
        return "darkblue";
    }
}

function getLinkColor(l) {
    if (l === selectedLink) {
        return "blue";
    } else if (l.source === selectedNode || l.target === selectedNode) {
        return "crimson";
    } else if (selectedLink && (l.source === selectedLink.source || l.target === selectedLink.source || l.source === selectedLink.target || l.target === selectedLink.target)) {
        return "crimson";
    } else {
        return "lightgray";
    }
}

function finishGraphInit() {
    allNbrsById = {};
    allNodes.forEach(node => allNbrsById[node.id] = [])
    allLinks.forEach(link => {
        allNbrsById[link.source.id].push({ l: link, n: link.target });
        allNbrsById[link.target.id].push({ l: link, n: link.source });
    });
}

function permute(array) {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
}

function zoomed(event) {
    panGroup.setAttribute("transform", event.transform);
    updateCenterCoordinates(event.transform);
}

function throttle(func, delay) {
    let lastCall = 0;
    return function (...args) {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
            return;
        }
        lastCall = now;
        return func(...args);
    };
}

function start(mode) {
    if (mode === "random") {
        initRandomGraph(1000, 3000);
        loadInitialGraph([], 200);
    } else if (mode === "star") {
        initStarGraph(35);
        loadInitialGraph([allNodes[0]], 5);
    }

    renderGraph();
    startSimulation();

    const firstNode = Object.values(loadedNodes)[0];
    selectNode(firstNode);
    simulateLinks(nbrClosure(firstNode));

    updateCenterCoordinates();
    window.addEventListener('resize', updateCenterCoordinates);
}

// start("star");
start("random");

