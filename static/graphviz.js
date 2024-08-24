<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DAG Visualization with D3.js</title>
    <style>
        body {
            background-color: black;
            margin: 0; /* Optional: removes default margin */
            padding: 0; /* Optional: removes default padding */
        }

        text {
            font-size: 16px;
            fill: white; /* Ensure the text is visible */
            text-anchor: middle; /* Center the text horizontally */
        }

        .node circle {
            stroke: #000;
            stroke-width: 1.5px;
        }

        .node text {
            font: 12px sans-serif;
            pointer-events: none;
        }

        .link {
            fill: none;
            stroke: #999;
            stroke-opacity: 0.6;
            stroke-width: 1.5px;
            marker-end: url(#arrowhead);
        }
    </style>
</head>
<body>
    <div style="text-align: center; margin-bottom: 10px;">
        <input type="text" id="search" placeholder="Search for a node or edge...">
        <button onclick="searchGraph()">Search</button>
    </div>
    <svg id="mySvg" width="960" height="600">
        <rect width="960" height="600" fill="none" stroke="white"></rect> <!-- Bounding box -->
        <g id="panGroup">
            <!-- All pan/zoomable content should go here -->
        </g>
        <text id="centerCoords" x="50%" y="50%">480, 300</text> <!-- Center coordinates -->
    </svg>

    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script>
        const width = 960;
        const height = 600;

        const nc = 1000
        const ec = 3000

        const mySvg = document.getElementById('mySvg');
        const panGroup = document.getElementById('panGroup');
        const text = document.getElementById('centerCoords');

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                panGroup.setAttribute("transform", event.transform);
                updateCenterCoordinates(event.transform);
            });

        const svg = d3.select(mySvg)
            .attr("width", width)
            .attr("height", height)
            .style("position", "relative")  // Ensure SVG positioning
            .call(zoom)
            .append("g");

       // Append a rectangle as a bounding box
       //svg.append("rect")
       //    .attr("x", 0)
       //    .attr("y", 0)
       //    .attr("width", width)
       //    .attr("height", height)
       //    .attr("fill", "none")
       //    .attr("stroke", "black")
       //    .attr("stroke-width", 2);  // Adjust stroke width as needed

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

        const nodes = Array.from({ length: nc }, (_, i) => ({ id: `n${i}` }));
        const links = Array.from({ length: ec }, () => {
            src = Math.floor(Math.random() * (nc-1))
            tgt = Math.floor(Math.random() * (nc-1))
            if (src > tgt) {
                temp = src;src = tgt; tgt = temp;
            }
            tgt = tgt + 1

            id = `e_${src}_${tgt}`
	    retval = ({
                id:     id,
                source: nodes[src],
                target: nodes[tgt]
            })
            return retval
        });


        const simulation = d3.forceSimulation(nodes)
            .force(
                "link",
                d3.forceLink(links)
                  .id(d => d.id)
                  .distance(20))
            .force("charge", d3.forceManyBody().strength(-20))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide(15))
            .on("tick", ticked);

        const link = d3.select(panGroup).append("g")
                          .attr("class", "links")
                        .selectAll("line")
                          .data(links)
                          .enter()
                          .append("line")
                            .attr("stroke-width", 2)
                            .attr("class", "link")
                            .on("click", function(event, d) {
                                selectEdge(d);
                            });

        const node = d3.select(panGroup).append("g")
                          .attr("class", "nodes")
                        .selectAll("g")
                          .data(nodes)
                          .enter().append("g")
                            .attr("class", "node")
                            .on("click", function(event, d) {
                                selectNode(d);
                            });

        node.append("circle")
            .attr("fill", "lightgreen")
            .attr("r", 10);

        node.append("text")
              .attr("x", 0)
              .attr("y", 0)
              .attr("dy", ".35em")
              .attr("text-anchor", "middle")
              .style("font-size", "0.33em")
              .text(d => d.id)
              .attr("fill", "deepblue");  // Default text color

        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("transform", d => `translate(${d.x},${d.y})`);

            updateCenterCoordinates();
        }

        const updateCenterCoordinates = (transform = null) => {
            if (transform == null) {
                return
            }
            const svgRect = mySvg.getBoundingClientRect();

            const [centerX, centerY] = transform.invert([svgRect.width / 2, svgRect.height / 2]);

            text.textContent = `${Math.round(centerX)}, ${Math.round(centerY)}`;
        };
        window.addEventListener('resize', updateCenterCoordinates);
        updateCenterCoordinates(); // Initial call to set coordinates

        function searchGraph() {
            const searchTerm = document.getElementById('search').value;
            const foundNode = nodes.find(node => node.id === searchTerm);
            if (foundNode) {
                selectNode(foundNode);
            } else {
                const foundLink = links.find(link => link.id === searchTerm);
                if (foundLink) {
                    selectEdge(foundLink);
                } else {
                    alert("Node or edge not found");
                }
            }
        }
        let selectedNode = null; // Keep track of the currently selected node
        let selectedEdge = null; // Keep track of the currently selected edge
        let selectedNeighbors = new Set(); // Keep track of the selected neighbors

        function colorNode(node, circleColor, textColor) {
            nbrElement = d3.selectAll(".node").filter(d => d === node)
            nbrElement.select("circle").attr("fill", circleColor);
            nbrElement.select("text").attr("stroke", textColor).attr("stroke-width", "1px").attr("font-size", "11px")
        }

        function deSelectNbrs() {
                selectedNeighbors.forEach(neighbor => {
                    colorNode(neighbor, "lightgreen", "DarkBlue")
                });
                selectedNeighbors.clear();
        }

        function deSelectNode() {
            if (selectedNode) {
                // Reset the selected node's text color to DarkBlue
                colorNode(selectedNode, "lightgreen", "DarkBlue")
                selectedNode = null; // Clear the selected node

                // Reset the color of edges connected to the previously selected node to light gray
                d3.selectAll(".link")
                    .attr("stroke", "lightgray");

                // Clear the selected neighbors set and reset their colors
                deSelectNbrs()
            }
        }

        function deSelectEdge() {
            if (selectedEdge) {
                // Reset the selected edge's color to light gray
                d3.selectAll(".link")
                    .filter(d => d === selectedEdge)
                    .attr("stroke", "lightgray");
                colorNode(selectedEdge.source, "lightgreen", "DarkBlue")
                colorNode(selectedEdge.target, "lightgreen", "DarkBlue")
                selectedEdge = null; // Clear the selected edge

                // Clear the selected neighbors set and reset their colors
                deSelectNbrs()
            }
        }

        function selectNbr(selectedNeighbor) {
            colorNode(selectedNeighbor, "lightyellow", "black");
            selectedNeighbors.add(selectedNeighbor);
        }

        function showBoundingBox() {
            // Calculate the bounding box and zoom to show all neighbors
            setTimeout(() => {
                let xs = new Set();
                let ys = new Set();

                if (selectedNode) {
                    xs.add(selectedNode.x)
                    ys.add(selectedNode.y)
                }

                if (selectedEdge) {
                    xs.add(selectedEdge.source.x).add(selectedEdge.target.x)
                    ys.add(selectedEdge.source.y).add(selectedEdge.target.y)
                }

                selectedNeighbors.forEach(neighbor => {
                    xs.add(neighbor.x)
                    ys.add(neighbor.y)
                });

                if (xs.size >= 1) {
                    x0 = d3.min(xs), y0 = d3.min(ys), x1=d3.max(xs), y1 = d3.max(ys)

                    const boxWidth = Math.max(0.1, x1 - x0);
                    const boxHeight = Math.max(0.1, y1 - y0);
 
                    const scale = 0.8*Math.min(width / boxWidth, height / boxHeight);

                    const translateX = (width - scale * (x0 + x1)) / 2;
                    const translateY = (height - scale * (y0 + y1)) / 2;


                    const transform = d3.zoomIdentity
                        .translate(translateX, translateY)
                        .scale(scale);

                    d3.select(mySvg).transition()
                        .duration(1500)
                        .call(
                            zoom.transform,
                            transform
                        ).on("end", () => {
                            updateCenterCoordinates(transform);
                        });
                }
            }, 1000);
        }

        function selectNode(nodeData) {
            toggleCase = (nodeData == selectedNode)

            // De-select any previously selected node or edge
            deSelectNode();
            deSelectEdge();

            if (toggleCase) {
                return;
            }

            // Highlight the selected node's text
            colorNode(nodeData, "pink", "red")
            selectedNode = nodeData;

            // Identify neighbors and add them to the selectedNeighbors set
            selectedNeighbors.clear();
            links.forEach(link => {
                if (link.source === nodeData) {
                    selectNbr(link.target);
                } else if (link.target === nodeData) {
                    selectNbr(link.source);
                }
            });

            // Apply blue color to edges connecting selected node to its neighbors and between neighbors
            d3.selectAll(".link")
                .attr("stroke", d => {
                    return (selectedNeighbors.has(d.source) && selectedNeighbors.has(d.target)) ? "blue" : "lightgray";
                });

            // Apply stronger repulsive force limited to a certain distance for neighbors
            simulation
                .force(
                    "link",
                    d3.forceLink(links.filter(link => link.source == nodeData || link.target == nodeData))
                        .id(d => d.id)
                        .distance(50))
                .force(
                    "charge",
                    d3.forceManyBody()
                         .strength(-600)
                        //  .strength(d => selectedNeighbors.has(d) ? -600 : -200)  // 3x repulsive force for neighbors
                        //  .distanceMax(d => selectedNeighbors.has(d) ? 100 : Infinity)) // Limit force to 100 units for neighbors
                )
                .alpha(1)
                .restart();

            showBoundingBox();
        }

        function selectEdge(edgeData) {
            toggleCase = (edgeData == selectedEdge)

            // De-select any previously selected node or edge
            deSelectNode();
            deSelectEdge();

            if (toggleCase) {
                return;
            }

            // Highlight the selected edge in blue
            d3.selectAll(".link")
                .filter(d => d == edgeData)
                .attr("stroke", "blue");

            colorNode(edgeData.source, "pink", "red")
            colorNode(edgeData.target, "pink", "red")
            selectedEdge = edgeData;

            // Identify all neighbors of the source and target nodes and add them to the selectedNeighbors set
            links.forEach(link => {
                if (link.source != edgeData.source || link.target != edgeData.target) {
                    if (link.source === edgeData.source || link.source === edgeData.target)
                        selectNbr(link.target);
                    else if (link.target === edgeData.source || link.target === edgeData.target) {
                        selectNbr(link.source);
                    }
		}
            });

            // Apply blue color to edges connecting the source/target of the selected edge to their neighbors
            d3.selectAll(".link")
                .attr("stroke", d => {
                    return (selectedNeighbors.has(d.source) && selectedNeighbors.has(d.target)) ? "blue" : "lightgray";
                });

            // Apply stronger repulsive force limited to a certain distance for neighbors
            simulation
                .force(
                    "link",
                    d3.forceLink(links.filter(link => (link.source == edgeData.source) || (link.target == edgeData.target)
                                                      || (link.target == edgeData.source) || (link.source == edgeData.target)))
                        .id(d => d.id)
                        .distance(d => selectedNeighbors.has(d.source) || selectedNeighbors.has(d.target) ? 50 : 80)
                        )
                .force(
                    "charge",
                    d3.forceManyBody()
                        .strength(-20)
                        //  .strength(d => selectedNeighbors.has(d) ? -200)  // 3x repulsive force for neighbors
                        //  .distanceMax(d => selectedNeighbors.has(d) ? 100 : Infinity) // Limit force to 100 units for neighbors
                    )
                .alpha(1)
                .restart();

            showBoundingBox();
        }

        selectNode(nodes[0])

    </script>
</body>
</html>

