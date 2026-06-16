import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Spin } from 'antd';
import { API_BASE } from '../api';

export default function GraphPanel({ onNodeClick }: { onNodeClick?: (nodeId: string) => void }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const fetchGraphData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
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
        width: window.innerWidth - 64, // 减去 App.tsx 的 padding
        height: window.innerHeight - 120
      });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      // 调整排斥力和连线距离让节点散开，避免重叠
      fgRef.current.d3Force('charge').strength(-400);
      fgRef.current.d3Force('link').distance(100);
      
      // 等待力导向图稳定后自动居中
      setTimeout(() => {
        if (fgRef.current) fgRef.current.zoomToFit(500, 50);
      }, 800);
    }
  }, [graphData]);

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
        nodeAutoColorBy="group"
        nodeVal="val"
        onNodeClick={(node: any) => onNodeClick?.(node.name || node.id)}
        linkColor={() => 'rgba(255,255,255,0.2)'}
        linkDirectionalArrowLength={3.5}
        linkCurvature={0.2}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          // 增加点击区域，让文字部分也能被点击
          const radius = Math.sqrt((node.val as number) || 1) * 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 20, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          // 只在略微放大或者节点较少时显示所有文字
          const label = node.name as string;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const radius = Math.sqrt((node.val as number) || 1) * 4;
          const yPos = (node.y as number) + radius + (fontSize * 1.5);
          const textWidth = ctx.measureText(label).width;
          const bgHeight = fontSize + 2;

          // 半透明背景，防止文字叠加时糊成一团
          ctx.fillStyle = 'rgba(10, 15, 28, 0.7)';
          ctx.fillRect((node.x as number) - textWidth / 2 - 2, yPos - bgHeight / 2, textWidth + 4, bgHeight);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(label, node.x as number, yPos);
        }}
      />
    </div>
  );
}
