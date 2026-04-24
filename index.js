const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running');
});

const singlePairPattern = /^[A-Z]->[A-Z]$/;

function checkRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object with a data field' };
  }

  const source = body.data;
  if (!Array.isArray(source)) {
    return { error: 'data must be an array' };
  }

  return { list: source };
}

function validateEdgePattern(candidate) {
  if (typeof candidate !== 'string') {
    return false;
  }

  const cleanValue = candidate.trim();
  if (!singlePairPattern.test(cleanValue)) {
    return false;
  }

  const [from, to] = cleanValue.split('->');
  if (from === to) {
    return false;
  }

  return true;
}

function reviewEdgeList(items) {
  const validEdges = [];
  const invalidEdges = [];

  for (const raw of items) {
    if (typeof raw !== 'string') {
      invalidEdges.push(String(raw));
      continue;
    }

    const trimmed = raw.trim();
    if (validateEdgePattern(trimmed)) {
      validEdges.push(trimmed);
    } else {
      invalidEdges.push(trimmed);
    }
  }

  return { validEdges, invalidEdges };
}

function filterUniqueEdges(edges) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  for (const edge of edges) {
    if (seen.has(edge)) {
      duplicates.push(edge);
    } else {
      seen.add(edge);
      unique.push(edge);
    }
  }

  return { unique, duplicates };
}

function createNodeConnections(edges) {
  const nodeConnections = new Map();

  for (const edge of edges) {
    const [parentNode, childNode] = edge.split('->');

    if (!nodeConnections.has(parentNode)) {
      nodeConnections.set(parentNode, []);
    }
    nodeConnections.get(parentNode).push(childNode);

    if (!nodeConnections.has(childNode)) {
      nodeConnections.set(childNode, []);
    }
  }

  return nodeConnections;
}

function gatherChildReferences(nodeConnections) {
  const childReferences = new Set();

  for (const dependents of nodeConnections.values()) {
    for (const child of dependents) {
      childReferences.add(child);
    }
  }

  return childReferences;
}

function findStartingPoints(nodeConnections, childReferences) {
  const startingPoints = [];

  for (const node of nodeConnections.keys()) {
    if (!childReferences.has(node)) {
      startingPoints.push(node);
    }
  }

  return startingPoints.sort();
}

function buildNestedStructure(startingNode, nodeConnections) {
  const childrenList = nodeConnections.get(startingNode) || [];

  if (childrenList.length === 0) {
    return { [startingNode]: {} };
  }

  const childNesting = {};
  for (const child of childrenList) {
    const childStructure = buildNestedStructure(child, nodeConnections);
    Object.assign(childNesting, childStructure);
  }

  return { [startingNode]: childNesting };
}

function createHierarchyList(rootNodeList, nodeConnections) {
  const hierarchyArray = [];

  for (const root of rootNodeList) {
    const singleTree = buildNestedStructure(root, nodeConnections);
    hierarchyArray.push(singleTree);
  }

  return hierarchyArray;
}

function calculateTreeHeight(nodeName, nodeConnections) {
  const directChildren = nodeConnections.get(nodeName) || [];

  if (directChildren.length === 0) {
    return 1;
  }

  let maxChildDepth = 0;
  for (const childNode of directChildren) {
    const childDepth = calculateTreeHeight(childNode, nodeConnections);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }

  return 1 + maxChildDepth;
}

function detectCircularPaths(startNode, nodeConnections) {
  const explorationMemo = new Set();
  const currentTrail = new Set();
  const trailSequence = [];
  const connectedNodes = new Set();

  function traverseWithMemory(node) {
    connectedNodes.add(node);

    if (explorationMemo.has(node)) {
      return false;
    }

    if (currentTrail.has(node)) {
      const cycleStart = trailSequence.indexOf(node);
      if (cycleStart !== -1) {
      }
      return true;
    }

    currentTrail.add(node);
    trailSequence.push(node);

    const directChildren = nodeConnections.get(node) || [];
    for (const child of directChildren) {
      const foundCycle = traverseWithMemory(child);
      if (foundCycle) {
        return true;
      }
    }

    currentTrail.delete(node);
    trailSequence.pop();
    explorationMemo.add(node);
    return false;
  }

  const cycleFound = traverseWithMemory(startNode);
  return { hasCycle: cycleFound, componentNodes: connectedNodes };
}

function gatherTreeElements(startNode, nodeConnections) {
  const collectedNodes = new Set();

  function gatherNodes(node) {
    if (collectedNodes.has(node)) return;
    collectedNodes.add(node);
    const children = nodeConnections.get(node) || [];
    for (const child of children) {
      gatherNodes(child);
    }
  }

  gatherNodes(startNode);
  return collectedNodes;
}

function generateComponentReports(rootNodeList, nodeConnections) {
  const reportArray = [];

  for (const root of rootNodeList) {
    const cycleCheck = detectCircularPaths(root, nodeConnections);
    const singleTree = buildNestedStructure(root, nodeConnections);

    const reportEntry = {
      root: root,
    };

    if (cycleCheck.hasCycle) {
      reportEntry.tree = {};
      reportEntry.has_cycle = true;
    } else {
      reportEntry.tree = singleTree;
      reportEntry.depth = calculateTreeHeight(root, nodeConnections);
    }

    reportArray.push(reportEntry);
  }

  return reportArray;
}

function processCyclicComponents(nodeConnections) {
  const allNodeNames = Array.from(nodeConnections.keys());

  if (allNodeNames.length === 0) {
    return [];
  }

  allNodeNames.sort();
  const entryNode = allNodeNames[0];

  const cycleInfo = detectCircularPaths(entryNode, nodeConnections);

  const cycleReport = {
    root: entryNode,
    tree: {},
    has_cycle: true,
  };

  return [cycleReport];
}

function compileSummaryStats(hierarchyReportsList) {
  const summaryMetrics = {
    total_trees: 0,
    total_cycles: 0,
    largest_tree_root: null,
  };

  let maxTreeDepth = 0;
  const depthCandidates = [];

  for (const report of hierarchyReportsList) {
    if (report.has_cycle) {
      summaryMetrics.total_cycles += 1;
    } else {
      summaryMetrics.total_trees += 1;

      if (report.depth !== undefined) {
        depthCandidates.push({
          root: report.root,
          depth: report.depth,
        });

        if (report.depth > maxTreeDepth) {
          maxTreeDepth = report.depth;
        }
      }
    }
  }

  if (depthCandidates.length > 0) {
    const largestTrees = depthCandidates.filter((entry) => entry.depth === maxTreeDepth);
    largestTrees.sort((a, b) => a.root.localeCompare(b.root));
    summaryMetrics.largest_tree_root = largestTrees[0].root;
  }

  return summaryMetrics;
}

app.post('/bfhl', (req, res) => {
  const incoming = checkRequestBody(req.body);
  if (incoming.error) {
    return res.status(400).json({ error: incoming.error });
  }

  const { list } = incoming;
  for (const item of list) {
    if (typeof item !== 'string') {
      return res.status(400).json({
        error: 'All items in data must be strings',
        invalid_edges: list.filter((entry) => typeof entry !== 'string').map(String),
      });
    }
  }

  const { validEdges, invalidEdges } = reviewEdgeList(list);
  const { unique, duplicates } = filterUniqueEdges(validEdges);

  const nodeConnections = createNodeConnections(unique);
  const childReferences = gatherChildReferences(nodeConnections);
  const startingPoints = findStartingPoints(nodeConnections, childReferences);

  const allNodes = new Set(nodeConnections.keys());
  const processedNodes = new Set();
  const componentReports = [];

  for (const root of startingPoints) {
    if (processedNodes.has(root)) continue;

    const cycleCheck = detectCircularPaths(root, nodeConnections);
    const { hasCycle, componentNodes } = cycleCheck;

    if (hasCycle) {
      const sortedComponent = Array.from(componentNodes).sort();
      const cycleRoot = sortedComponent[0];
      componentReports.push({
        root: cycleRoot,
        tree: {},
        has_cycle: true,
      });
      for (const node of componentNodes) {
        processedNodes.add(node);
      }
    } else {
      const treeStructure = buildNestedStructure(root, nodeConnections);
      const treeDepth = calculateTreeHeight(root, nodeConnections);
      const treeNodes = gatherTreeElements(root, nodeConnections);

      componentReports.push({
        root: root,
        tree: treeStructure,
        depth: treeDepth,
      });

      for (const node of treeNodes) {
        processedNodes.add(node);
      }
    }
  }

  for (const node of allNodes) {
    if (processedNodes.has(node)) continue;

    const cycleCheck = detectCircularPaths(node, nodeConnections);
    const { componentNodes } = cycleCheck;

    const sortedComponent = Array.from(componentNodes).sort();
    const cycleRoot = sortedComponent[0];

    componentReports.push({
      root: cycleRoot,
      tree: {},
      has_cycle: true,
    });

    for (const n of componentNodes) {
      processedNodes.add(n);
    }
  }

  const summaryMetrics = compileSummaryStats(componentReports);

  const apiResponse = {
    user_id: "yourname_24042026",
    email_id: "your.email@college.edu",
    college_roll_number: "YOUR_ROLL_NUMBER",
    hierarchies: componentReports,
    invalid_entries: invalidEdges,
    duplicate_edges: duplicates,
    summary: summaryMetrics,
  };

  return res.json(apiResponse);
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, () => {
  console.log(`bfhl service started on port ${port}`);
});
