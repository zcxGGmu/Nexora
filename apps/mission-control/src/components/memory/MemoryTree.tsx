import type { JSX } from "react";

export type MemoryNode = {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly children: readonly MemoryNode[];
};

export function MemoryTree(props: { readonly nodes: readonly MemoryNode[] }): JSX.Element {
  return (
    <section className="panel" aria-labelledby="memory-tree-title">
      <div className="panel-header"><h2 id="memory-tree-title">Memory Tree</h2></div>
      <div className="tree-list" role="tree">
        {props.nodes.map((node) => <MemoryTreeNode node={node} key={node.id} />)}
      </div>
    </section>
  );
}

function MemoryTreeNode(props: { readonly node: MemoryNode }): JSX.Element {
  return (
    <div className="tree-branch" role="treeitem" aria-expanded={props.node.children.length > 0}>
      <span>{props.node.label}</span>
      <span className="status-badge status-badge--info">Type {props.node.type}</span>
      {props.node.children.map((child) => <MemoryTreeNode node={child} key={child.id} />)}
    </div>
  );
}
