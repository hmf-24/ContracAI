import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Spin, Drawer, Descriptions, Button } from 'antd';
import { API_BASE } from '../api';

export default function GraphPanel({ onNodeClick }: { onNodeClick?: (nodeId: string) => void }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/graph`, { headers });
        if (response.ok) {
          const data = await response.json();
          setGraphData(data);
        }
      } catch (error) {
        console.error("Failed to load graph data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGraphData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth - 64,
        height: window.innerHeight - 120
      });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      fgRef.current.d3Force('charge').strength(-800);
      fgRef.current.d3Force('link').distance(150);
      
      setTimeout(() => {
        if (fgRef.current) fgRef.current.zoomToFit(500, 50);
      }, 800);
    }
  }, [graphData]);

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
    setDrawerVisible(true);
  };

  const jumpToLedger = () => {
    if (selectedNode) {
      onNodeClick?.(selectedNode.name || selectedNode.id);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: 'calc(100vh - 120px)', background: 'transparent' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="name"
        onNodeClick={handleNodeClick}
        linkColor={(link: any) => link.name === '依赖' ? 'rgba(255, 100, 100, 0.6)' : 'rgba(100, 200, 255, 0.3)'}
        linkWidth={(link: any) => link.name === '依赖' ? 3 : 1}
        linkDirectionalArrowLength={4}
        linkCurvature={0.2}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link: any, ctx, globalScale) => {
          const label = link.name;
          if (!label || globalScale < 0.6) return;

          const start = link.source;
          const end = link.target;
          if (typeof start !== 'object' || typeof end !== 'object') return;

          const textPos = {
            x: start.x + (end.x - start.x) / 2,
            y: start.y + (end.y - start.y) / 2
          };

          const relLink = { x: end.x - start.x, y: end.y - start.y };
          let textAngle = Math.atan2(relLink.y, relLink.x);
          if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
          if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);

          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          const textWidth = ctx.measureText(label).width;
          const bgHeight = fontSize + 2;

          ctx.save();
          ctx.translate(textPos.x, textPos.y);
          ctx.rotate(textAngle);
          
          ctx.fillStyle = 'rgba(10, 15, 28, 0.8)';
          ctx.fillRect(-textWidth / 2 - 2, -bgHeight / 2, textWidth + 4, bgHeight);
          
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = link.name === '依赖' ? 'rgba(255, 150, 150, 0.9)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name as string;
          const isContract = node.group === 1 || node.group === 2;
          const isParty = node.group === 3;
          const isHandler = node.group === 4;

          // 减小节点体积乘数，避免画面被大圆圈占满
          const radius = Math.sqrt((node.val as number) || 1) * 2 + 4;
          
          // 绘制圆形背景
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = isContract ? (node.group === 1 ? '#4facfe' : '#00f2fe') : isParty ? '#f6d365' : '#a18cd1';
          ctx.fill();
          
          // 绘制 Emoji 图标
          let icon = '';
          if (isContract) icon = '📄';
          else if (isParty) icon = '🏢';
          else if (isHandler) icon = '🧑';
          
          const iconSize = radius * 1.2;
          ctx.font = `${iconSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, node.x, node.y + (radius * 0.1));

          // 绘制节点标签 (缩放过小时隐藏)
          if (globalScale >= 0.5) {
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const yPos = (node.y as number) + radius + (fontSize * 1.5);
            const textWidth = ctx.measureText(label).width;
            const bgHeight = fontSize + 2;

            ctx.fillStyle = 'rgba(10, 15, 28, 0.7)';
            ctx.fillRect((node.x as number) - textWidth / 2 - 2, yPos - bgHeight / 2, textWidth + 4, bgHeight);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(label, node.x as number, yPos);
          }
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          const radius = Math.sqrt((node.val as number) || 1) * 2 + 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 20, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />
      
      <Drawer
        title={selectedNode?.name || '节点详情'}
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={400}
      >
        {selectedNode && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="节点类型">
              {selectedNode.group === 1 ? '销售合同' : 
               selectedNode.group === 2 ? '采购合同' : 
               selectedNode.group === 3 ? '合作方' : 
               selectedNode.group === 4 ? '经办人' : '未知'}
            </Descriptions.Item>
            <Descriptions.Item label="名称">{selectedNode.name}</Descriptions.Item>
            <Descriptions.Item label="系统 ID">{selectedNode.id}</Descriptions.Item>
            {selectedNode.val && <Descriptions.Item label="权重值 (金额关联)">{selectedNode.val}</Descriptions.Item>}
          </Descriptions>
        )}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Button type="primary" onClick={jumpToLedger} block>
            去台账中检索此记录
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
