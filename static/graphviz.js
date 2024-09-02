class GraphView {
    constructor(svgId) {
        const svgElement = document.getElementById(svgId);
        this.width = svgElement.clientWidth || 960;
        this.height = svgElement.clientHeight || 600;
        this.nbr_loading_batchsize = 5;

        this.allNbrsById = {};

        this.loadedNodes = {};
        this.loadedLinksAdjlist = {};
        this.loadedLinks = {};

        this.selectedNode = null;
        this.selectedLink = null;
        this.selectedNeighbors = {};

        this.adjustedScaleFactor = 0.4;

        this.mySvg = d3.select(`#${svgId}`)
            .attr("width", this.width)
            .attr("height", this.height)
            .style("background", "yellow");

        // Add panGroup and centerCoordsElement to the DOM
        this.panGroup = this.mySvg.append("g").attr("id", "panGroup");
        this.centerCoordsElement = this.mySvg.append("text")
            .attr("id", "centerCoords")
            .attr("x", "50%")
            .attr("y", "50%")
            .attr("stroke", "black")
            .style("opacity", 0.1)
            .text("480, 300");

        this.titleText = this.mySvg.append("text")
            .attr("id", "title")
            .attr("x", 20)
            .attr("y", 30)
            .attr("font-size", "20px")
            .attr("font-weight", "bold")

        this.simulation = null;
        this.links = null;
        this.nodes = null;
    }

    setupGraphView(nodes, links, seedNodes, target_nodecount_to_load) {
        this.allNodes = nodes;
        this.allLinks = links;

        // Abbreviate the IDs for nodes
        this.abbreviateIDs(this.allNodes);

        this.finishGraphInit();
        this.loadInitialGraph(seedNodes, target_nodecount_to_load);

        const firstNode = ((seedNodes.length > 0) ? seedNodes[0] : Object.values(this.loadedNodes)[0]);
        if (firstNode) {
            this.startSimulation();

            this.selectNode(firstNode);
            this.simulateLinks(this.nbrClosure(firstNode));
            this.updateCenterCoordinates();
            this.renderGraph();
        } else {
            this.startSimulation();
            this.renderGraph();
        }

        window.addEventListener('resize', this.updateCenterCoordinates.bind(this));
    }

    clearView() {
        this.panGroup.selectAll("*").remove();
        this.loadedNodes = {};
        this.loadedLinksAdjlist = {};
        this.loadedLinks = {};
        this.selectedNode = null;
        this.selectedLink = null;
        this.selectedNeighbors = {};
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    searchGraph(searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        // Find matching nodes
        const matchingNodes = this.allNodes.filter(node => node.id.toLowerCase().includes(searchTerm));

        if (matchingNodes.length > 0) {
            // Zoom to the first matching node
            this.selectNode(matchingNodes[0]);
        } else {
            alert("No matching nodes found.");
        }
    }

    loadInitialGraph(seedNodes, target_nodecount_to_load) {
        let nodeQueue = [...seedNodes];
        let nodesProcessed = 0;
        let nbrsExcluded = new Set();

        if (!target_nodecount_to_load) {
            target_nodecount_to_load = this.allNodes.length;
        }
        while (nodeQueue.length > 0 || (nodesProcessed < target_nodecount_to_load && Object.keys(this.loadedNodes).length < this.allNodes.length)) {
            if (nodeQueue.length === 0) {
                const chosenIndex = 0;
                for (let i = 0; i < this.allNodes.length; i++) {
                    const curChosen = this.allNodes[(chosenIndex + i) % this.allNodes.length];
                    if (!this.loadedNodes[curChosen.id] && !nbrsExcluded.has(curChosen.id)) {
                        nodeQueue.push(curChosen);
                        break;
                    }
                }
            }

            if (nodeQueue.length === 0) break;

            const currentNode = nodeQueue.shift();
            if (this.loadedNodes[currentNode.id]) continue;

            this.addToLoadedNodes(currentNode);
            nodesProcessed++;

            const neighbors = this.allNbrsById[currentNode.id];
            const alreadyLoadedNeighbors = neighbors.filter(nbhood => this.loadedNodes[nbhood.n.id]);
            const nbrsStillNotLoaded = neighbors.filter(nbhood => !this.loadedNodes[nbhood.n.id]);
            this.permute(nbrsStillNotLoaded);

            alreadyLoadedNeighbors.forEach(nbhood => this.addToLoadedLinks(nbhood.l));

            const remainingGlobalCapacity = target_nodecount_to_load - nodesProcessed;
            const willLoadTheseManyMore = Math.min(this.nbr_loading_batchsize, remainingGlobalCapacity, nbrsStillNotLoaded.length);
            const selectedNotLoadedNeighbors = nbrsStillNotLoaded.slice(0, willLoadTheseManyMore);

            selectedNotLoadedNeighbors.forEach(nbhood => {
                this.addToLoadedNodes(nbhood.n);
                this.addToLoadedLinks(nbhood.l);
                nodeQueue.push(nbhood.n);
            });

            nbrsStillNotLoaded.slice(willLoadTheseManyMore).forEach(nbhood => nbrsExcluded.add(nbhood.n.id));
            this.manageLoadMoreNode(currentNode, nbrsStillNotLoaded.length - willLoadTheseManyMore);
        }
    }

    manageLoadMoreNode(currentNode, numOfNbrsStillNotLoaded) {
        const moreNodeId = "more_" + currentNode.id;
        const moreLinkId = `link_${currentNode.id}_${moreNodeId}`;

        if (numOfNbrsStillNotLoaded > 0) {
            const moreNodeLabel = `${numOfNbrsStillNotLoaded} more`;
            let moreNode = this.loadedNodes[moreNodeId];
            if (!moreNode) {
                moreNode = {
                    id: moreNodeId,
                    name: moreNodeLabel,
                    parentNodeId: currentNode.id
                };
                this.addToLoadedNodes(moreNode);

                const moreLink = {
                    id: moreLinkId,
                    source: currentNode,
                    target: moreNode,
                    virtual: true
                };
                this.addToLoadedLinks(moreLink);
            } else {
                moreNode.name = moreNodeLabel;
            }
        } else {
            if (this.loadedNodes[moreNodeId]) {
                delete this.loadedNodes[moreNodeId];
                delete this.loadedLinksAdjlist[currentNode.id][moreNodeId];
                delete this.loadedLinks[moreLinkId];
            }
        }
    }

    loadMoreNeighborsClicked(d) {
        const currentNode = this.loadedNodes[d.parentNodeId];
        if (!currentNode) return;

        const neighbors = this.allNbrsById[currentNode.id];
        const nbrsStillNotLoaded = neighbors.filter(nbhood => !this.loadedNodes[nbhood.n.id]);
        const willLoadTheseManyMore = Math.min(nbrsStillNotLoaded.length, this.nbr_loading_batchsize);

        const selectedNotLoadedNeighbors = nbrsStillNotLoaded.slice(0, willLoadTheseManyMore);
        selectedNotLoadedNeighbors.forEach(nbhood => {
            this.addToLoadedNodes(nbhood.n);
            this.addToLoadedLinks(nbhood.l);
            Object.values(this.allLinks).forEach(link => {
                let other = (nbhood.l.source == nbhood.n) ? nbhood.l.target : nbhood.l.source;
                if (link.source == nbhood.n && this.loadedNodes[other] && !this.loadedLinks[link.id]) {
                    this.addToLoadedLinks(link);
                }
            });
            if (this.selectedNode == currentNode) {
                this.selectedNeighbors[nbhood.n.id] = nbhood;
            }
        });

        this.manageLoadMoreNode(currentNode, nbrsStillNotLoaded.length - willLoadTheseManyMore);

        // Hack needed to work around improper rendering of new nodes, when not born selected.
        if (this.selectedNode != currentNode) {
            let oldSelectedNode = this.selectedNode;

            this.selectNode(currentNode);
            if (oldSelectedNode == null) {
                this.deSelectNode();
                this.deSelectNbrs();
            } else {
                this.selectNode(oldSelectedNode);
            }
        }
        this.renderGraph();
        this.startSimulation();
        this.simulateNodes([currentNode]);
    }

    showPopup(content) {
        // Create a popup div if it doesn't exist
        let popup = document.getElementById('nodePopup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'nodePopup';
            popup.style.position = 'absolute';
            popup.style.padding = '10px';
            popup.style.backgroundColor = 'white';
            popup.style.border = '1px solid black';
            popup.style.zIndex = 1000;
            document.body.appendChild(popup);
        }

        // Set the content of the popup
        popup.innerText = content;

        // Position the popup near the mouse cursor or at a default location
        popup.style.left = `${window.innerWidth / 2}px`;
        popup.style.top = `${window.innerHeight / 2}px`;

        // Show the popup
        popup.style.display = 'block';

        // Hide the popup after 3 seconds (optional)
        setTimeout(() => {
            popup.style.display = 'none';
        }, 15000);
    }

    startSimulation() {
        const nodesToSimulate = Object.values(this.loadedNodes);
        const linksToSimulate = Object.values(this.loadedLinks);

        this.simulation = d3.forceSimulation(nodesToSimulate)
            .force("link", d3.forceLink(linksToSimulate).id(d => d.id).distance(80))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collide", d3.forceCollide(30))
            .on("tick", this.throttle(this.ticked.bind(this), 16));
    }

    renderGraph() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", this.throttle(this.zoomed.bind(this), 50));

        const svg = this.mySvg
            .call(this.zoom);

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

        const linksData = Object.values(this.loadedLinks);
        const nodesData = Object.values(this.loadedNodes);

        this.links = this.panGroup.selectAll(".link")
            .data(linksData, d => d.id)
            .join(
                enter => enter.append("line")
                .attr("stroke-width", 2)
                .attr("class", "link")
                .style("stroke", this.getLinkColor.bind(this))
                .on("click", (event, l) => {
                    this.showPopup(l.id); // Show popup if the node is already selected
                    this.selectLink(l);
                    this.simulateLinks(this.nbrClosure(l));
                }),
                update => update.style("stroke", this.getLinkColor.bind(this)),
                exit => exit.remove()
            );

        this.nodes = this.panGroup.selectAll(".node")
            .data(nodesData, d => d.id)
            .join(
                enter => enter.append("g")
                .attr("class", "node")
                .on("click", (event, n) => {
                    this.showPopup(n.name || n.id); // Show popup if the node is already selected
                    if (n.id.startsWith("more_")) {
                        this.loadMoreNeighborsClicked(n);
                    } else {
                        this.selectNode(n);
                    }
                }),
                update => update,
                exit => exit.remove()
            );

        this.nodes.append("circle")
            .attr("fill", this.getNodeFillColor.bind(this))
            .attr("stroke", this.getNodeStrokeColor.bind(this))
            .attr("r", 10);

        this.nodes.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("dy", ".35em")
            .attr("stroke", "none")
            .attr("text-anchor", "middle")
            .style("font-size", "0.5em")
            .style("font-family", "Arial")
            //.text(d => (d === this.selectedNode || d === this.selectedLink?.source || d === this.selectedLink?.target) ? d.id : d.shortId)
            .text(d => d.shortId)
            .attr("fill", "darkblue");

        this.nodes.exit().remove();
    }

    finishGraphInit() {
        this.allNbrsById = {};
        this.allNodes.forEach(node => this.allNbrsById[node.id] = []);
        this.allLinks.forEach(link => {
            this.allNbrsById[link.source.id].push({
                l: link,
                n: link.target
            });
            this.allNbrsById[link.target.id].push({
                l: link,
                n: link.source
            });
        });
    }

    permute(array) {
        let currentIndex = array.length;
        while (currentIndex !== 0) {
            const randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
    }

    zoomed(event) {
        this.panGroup.attr("transform", event.transform);
        this.updateCenterCoordinates(event.transform);
    }

    ticked() {
        this.links
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        this.nodes
            .attr("transform", d => `translate(${d.x},${d.y})`);

        this.updateCenterCoordinates();
    }

    throttle(func, delay) {
        let lastCall = 0;
        return (...args) => {
            const now = new Date().getTime();
            if (now - lastCall < delay) {
                return;
            }
            lastCall = now;
            return func(...args);
        };
    }

    selectNode(nodeData) {
        if (!nodeData) {
            return
        }

        const toggleToDeSelectCase = this.selectedNode === nodeData;

        this.deSelectNode();
        this.deSelectLink();
        this.deSelectNbrs();

        if (toggleToDeSelectCase) {
            this.renderGraph();
            return;
        }

        this.selectedNode = nodeData;

        if (!this.loadedLinksAdjlist[nodeData.id]) {
            this.loadInitialGraph([nodeData], 1);
        }

        this.selectedNeighbors = {};
        Object.values(this.loadedLinksAdjlist[nodeData.id]).forEach(link => {
            const neighbor = link.source === nodeData ? link.target : link.source;
            this.selectedNeighbors[neighbor.id] = {
                n: neighbor,
                l: link
            };
        });

        this.renderGraph();
        this.simulateNodes([nodeData]);
    }

    selectLink(linkData) {
        if (!linkData) {
            return
        }

        const toggleToDeSelectCase = this.selectedLink === linkData;

        this.deSelectNode();
        this.deSelectLink();
        this.deSelectNbrs();

        if (toggleToDeSelectCase) {
            this.renderGraph();
            return;
        }

        this.selectedNeighbors = {};
        this.selectedNeighbors[linkData.source.id] = {
            n: linkData.source,
            l: linkData
        };
        this.selectedNeighbors[linkData.target.id] = {
            n: linkData.target,
            l: linkData
        };

        Object.values(this.loadedLinksAdjlist[linkData.source.id]).forEach(link => {
            const neighbor = link.source === linkData.source ? link.target : link.source;
            this.selectedNeighbors[neighbor.id] = {
                n: neighbor,
                l: link
            };
        });

        Object.values(this.loadedLinksAdjlist[linkData.target.id]).forEach(link => {
            const neighbor = link.source === linkData.target ? link.target : link.source;
            this.selectedNeighbors[neighbor.id] = {
                n: neighbor,
                l: link
            };
        });

        this.selectedLink = linkData;

        this.renderGraph();
        this.simulateLinks(this.nbrClosure(linkData));
    }

    deSelectNode() {
        if (this.selectedNode) {
            this.selectedNode = null;
            this.renderGraph();
        }
    }

    deSelectLink() {
        if (this.selectedLink) {
            this.selectedLink = null;
            this.renderGraph();
        }
    }

    deSelectNbrs() {
        this.selectedNeighbors = {};
        this.renderGraph();
    }

    simulateNodes(nodes) {
        const nbrClosures = nodes.map(node => this.nbrClosure(node));
        const nbrhoodLinks = new Set();
        nbrClosures.forEach(node_edges => node_edges.forEach(link => nbrhoodLinks.add(link)));

        return this.simulateLinks([...nbrhoodLinks]);
    }

    nbrClosure(o) {
        let nbrLinks = [];
        if (o.id in this.loadedLinks) {
            nbrLinks = [o, ...Object.values(this.loadedLinksAdjlist[o.source.id]), ...Object.values(this.loadedLinksAdjlist[o.target.id])];
        } else if (o.id in this.loadedNodes) {
            nbrLinks = Object.values(this.loadedLinksAdjlist[o.id]);
        }
        return nbrLinks;
    }

    simulateLinks(links) {
        this.simulation.force("link").links(links);
        this.simulation.alpha(0.3).restart(); // Adjusted alpha target
        this.zoomToBoundingBox();
    }

    zoomToBoundingBox() {
        if (this.selectedNode || this.selectedLink) {
            setTimeout(() => {
                const xs = new Set(),
                    ys = new Set();

                if (this.selectedNode) {
                    xs.add(this.selectedNode.x);
                    ys.add(this.selectedNode.y);
                }

                if (this.selectedLink) {
                    xs.add(this.selectedLink.source.x).add(this.selectedLink.target.x);
                    ys.add(this.selectedLink.source.y).add(this.selectedLink.target.y);
                }

                Object.values(this.selectedNeighbors).forEach(ls => {
                    xs.add(ls.n.x);
                    ys.add(ls.n.y);
                });

                if (xs.size >= 1) {
                    const x0 = d3.min(xs),
                        y0 = d3.min(ys),
                        x1 = d3.max(xs),
                        y1 = d3.max(ys);
                    console.log(x0, y0, x1, y1)
                    const boxWidth = Math.max(0.1, x1 - x0);
                    const boxHeight = Math.max(0.1, y1 - y0);
                    const scale = Math.max(0.1, Math.min(8, this.adjustedScaleFactor * Math.min(this.width / boxWidth, this.height / boxHeight)));
                    const translateX = (this.width - scale * (x0 + x1)) / 2;
                    const translateY = (this.height - scale * (y0 + y1)) / 2;

                    const transform = d3.zoomIdentity
                        .translate(translateX, translateY)
                        .scale(scale);

                    d3.select(this.mySvg.node()).transition()
                        .duration(1500)
                        .call(this.zoom.transform, transform)
                        .on("end", () => {
                            this.updateCenterCoordinates(transform);
                        });
                }
            }, 1000);
        }
    }

    updateCenterCoordinates(transform = null) {
        try {
            const svgRect = this.mySvg.node().getBoundingClientRect();
            const [centerX, centerY] = transform ? transform.invert([svgRect.width / 2, svgRect.height / 2]) : [this.width / 2, this.height / 2];
            this.centerCoordsElement.text(`${Math.round(centerX)}, ${Math.round(centerY)}`);
        } catch (err) {
            console.log("Ignoring error: ", err.message);
        }
    }

    addToLoadedNodes(node) {
        if (!this.loadedNodes[node.id]) {
            this.loadedNodes[node.id] = node;
            this.loadedLinksAdjlist[node.id] = {};
        }
    }

    addToLoadedLinks(link) {
        this.addToLoadedNodes(link.source);
        this.addToLoadedNodes(link.target);

        this.loadedLinksAdjlist[link.source.id][link.target.id] = link;
        this.loadedLinksAdjlist[link.target.id][link.source.id] = link;

        this.loadedLinks[link.id] = link;
    }

    getNodeFillColor(n) {
        if (n.id.startsWith("more")) {
            return "#CFFF04";
        } else if (this.selectedNode) {
            if (n === this.selectedNode) {
                return "lightblue";
            } else if (n.id in this.selectedNeighbors) {
                return "pink";
            }
        } else if (this.selectedLink && (n === this.selectedLink.source || n === this.selectedLink.target) || n.id in this.selectedNeighbors) {
            return "pink";
        }
        return "lightgreen";
    }

    getNodeStrokeColor(n) {
        return n.id.startsWith("more") ? "white" : "black";
    }

    getNodeTextColor(n) {
        if (this.selectedNode && (n === this.selectedNode || n.id in this.selectedNeighbors)) {
            return "red";
        } else if (this.selectedLink && (n === this.selectedLink.source || n === this.selectedLink.target) || n.id in this.selectedNeighbors) {
            return "red";
        } else {
            return "darkblue";
        }
    }

    getLinkColor(l) {
        if (l === this.selectedLink) {
            return "blue";
        } else if (l.source === this.selectedNode || l.target === this.selectedNode) {
            return "crimson";
        } else if (this.selectedLink && (l.source === this.selectedLink.source || l.target === this.selectedLink.source || l.source === this.selectedLink.target || l.target === this.selectedLink.target)) {
            return "crimson";
        } else {
            return "lightgray";
        }
    }

    // Abbreviation method for IDs
    abbreviateIDs(nodes) {
        const typeAbbrMap = {}; // Cache for ID type abbreviations

        function abbreviateType(type) {
            const lowerCaseType = type.toLowerCase();
            if (typeAbbrMap[lowerCaseType]) {
                return typeAbbrMap[lowerCaseType];
            }

            // Generate abbreviation using a heuristic
            const parts = lowerCaseType.split(/[\W_]+/); // Split by non-alphanumeric characters
            let abbr = parts.map(part => part.charAt(0)).join('').substring(0, 2).toUpperCase();
            typeAbbrMap[lowerCaseType] = abbr;

            return abbr;
        }

        function abbreviateValue(type, value) {
            const lowerCaseType = type.toLowerCase();
            if (lowerCaseType.includes('email')) {
                const atIndex = value.indexOf('@');
                if (atIndex > 0) {
                    return value.slice(0, Math.min(5, atIndex)) + (atIndex > 5 ? '..' : '');
                }
            }

            if (lowerCaseType.includes('phone')) {
                return '..' + value.slice(-4);
            } else {
                return value.slice(0, 6);
            }
        }

        nodes.forEach(node => {
            const [type, value] = node.id.split(':');
            const shortType = abbreviateType(type);
            const shortValue = abbreviateValue(type, value);
            node.shortId = `${shortType}::${shortValue}`;
        });
    }
}

function createRandomGraph(full_node_count, full_link_count) {
    retval = {}
    retval.allNodes = Array.from({
        length: full_node_count
    }, (_, i) => ({
        id: `n${i}`
    }));
    retval.allLinks = Array.from({
        length: full_link_count
    }, () => {
        let src = Math.floor(Math.random() * (full_node_count - 1));
        let tgt = Math.floor(Math.random() * (full_node_count - 1));
        if (src > tgt)[src, tgt] = [tgt, src];
        tgt = tgt + 1;

        return {
            id: `e_${src}_${tgt}`,
            source: retval.allNodes[src],
            target: retval.allNodes[tgt]
        };
    });
    return retval;
}

function createStarGraph(node_count) {
    retval = {}
    retval.allNodes = Array.from({
        length: node_count
    }, (_, i) => ({
        id: `n${i}`
    }));
    retval.allLinks = Array.from({
        length: node_count - 1
    }, (_, i) => {
        return {
            id: `e_0_${i + 1}`,
            source: retval.allNodes[0],
            target: retval.allNodes[i + 1]
        };
    });
    return retval;
}

function start(mode) {
    const graphView = new GraphView("mySvg");
    var graph;
    if (mode === "random") {
        graph = createRandomGraph(1000, 3000);
        seedNodes = [];
        target_nodecount_to_load = 200;
    } else if (mode === "star") {
        graph = createStarGraph(35);
        console.log(graph.allNodes);
        seedNodes = [graph.allNodes[0]];
        target_nodecount_to_load = 5;
    }

    graphView.setupGraphView(graph.allNodes, graph.allLinks, seedNodes, target_nodecount_to_load);
}

// start("star");
// start("random");
