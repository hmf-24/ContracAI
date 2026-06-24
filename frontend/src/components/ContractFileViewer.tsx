import React, { useState, useRef, useEffect } from 'react';
import { Button, Space, Empty, Spin } from 'antd';
import { FullscreenOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { API_BASE } from '../api';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// 设置 worker，使用 unpkg 保证版本与 react-pdf 内部的 pdfjs 严格一致
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface BBoxInfo {
  text?: string;
  bbox: number[]; // [x0, y0, x1, y1, pageNum]
}

interface ContractFileViewerProps {
  /** 文件的 URL 路径 */
  fileUrl: string | null | undefined;
  originalFilename?: string;
  height?: string | number;
  showToolbar?: boolean;
  allBboxes?: BBoxInfo[]; // “台账需要记录的哪些信息” - 预高亮
  activeBbox?: number[];  // 焦点高亮 [x0, y0, x1, y1, pageNum]
}

export default function ContractFileViewer({
  fileUrl,
  originalFilename,
  height = '100%',
  showToolbar = true,
  allBboxes = [],
  activeBbox = undefined,
}: ContractFileViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 保存每页的原始尺寸，以便计算 bbox 的百分比或缩放
  const [pageMetrics, setPageMetrics] = useState<Record<number, { width: number; height: number; scale: number }>>({});

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth - 32); // 减去 padding
    }
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 32);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fileUrl]);

  // 当 activeBbox 改变时，自动滚动到那一页
  useEffect(() => {
    if (activeBbox && activeBbox.length >= 5) {
      const pageNum = activeBbox[4];
      const pageElement = document.getElementById(`pdf-page-${pageNum}`);
      if (pageElement && containerRef.current) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeBbox]);

  if (!fileUrl) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height, background: 'var(--color-bg-subtle, #0d1117)', borderRadius: 8,
      }}>
        <Empty
          image={<FileTextOutlined style={{ fontSize: 48, color: 'rgba(255,255,255,0.2)' }} />}
          description={<span style={{ color: 'rgba(255,255,255,0.4)' }}>暂无合同原文</span>}
        />
      </div>
    );
  }

  let fullUrl = fileUrl;
  if (!fullUrl.startsWith('http')) {
    // 处理可能传入的绝对路径 (兼容旧数据)
    if (fullUrl.includes('uploads') && fullUrl.includes('contracts')) {
      const parts = fullUrl.split(/[/\\]/);
      const filename = parts[parts.length - 1];
      fullUrl = `/contracts-files/${filename}`;
    } else if (fullUrl.startsWith('/')) {
      fullUrl = `${API_BASE.replace('/api', '')}${fullUrl}`;
    }
  }
  const ext = fileUrl.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';

  const handleFullscreen = () => window.open(fullUrl, '_blank');
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = originalFilename || `contract.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const renderBBoxes = (pageNum: number) => {
    const metrics = pageMetrics[pageNum];
    if (!metrics) return null;

    // 过滤出这一页的 bboxes
    const pageBboxes = allBboxes.filter(b => b.bbox && b.bbox.length >= 5 && b.bbox[4] === pageNum);
    
    // 我们目前收到的 bbox 已经是 0-1 的百分比
    const renderWidth = containerWidth || metrics.width;
    const renderHeight = renderWidth * (metrics.height / metrics.width);

    return (
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* 焦点高亮 (Active Bbox) */}
        {activeBbox && activeBbox.length >= 5 && activeBbox[4] === pageNum && (() => {
          let [ax0, ay0, ax1, ay1] = activeBbox;
          if (ax0 > 2 || ay0 > 2) {
            ax0 = ax0 / metrics.width;
            ay0 = ay0 / metrics.height;
            ax1 = ax1 / metrics.width;
            ay1 = ay1 / metrics.height;
          }
          return (
            <div
              id="active-highlight-box"
              style={{
                position: 'absolute',
                left: ax0 * renderWidth,
                top: ay0 * renderHeight,
                width: (ax1 - ax0) * renderWidth,
                height: (ay1 - ay0) * renderHeight,
                backgroundColor: 'rgba(250, 173, 20, 0.3)', // 金黄色高亮
                border: '2px solid #faad14',
                borderRadius: 4,
                boxShadow: '0 0 12px rgba(250, 173, 20, 0.8)',
                zIndex: 10,
                transition: 'all 0.3s ease',
              }}
            />
          );
        })()}
      </div>
    );
  };

  // 监听 activeBbox 变化，自动滚动到高亮区域
  useEffect(() => {
    if (activeBbox && activeBbox.length >= 5) {
      setTimeout(() => {
        const el = document.getElementById('active-highlight-box');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [activeBbox]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height,
      background: 'var(--color-bg-subtle, #0d1117)', borderRadius: 8, overflow: 'hidden',
    }}>
      {/* 工具栏 */}
      {showToolbar && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
            📄 {originalFilename || '合同原文'}
          </span>
          <Space size={4}>
            <Button type="text" size="small" icon={<FullscreenOutlined />} onClick={handleFullscreen} style={{ color: 'rgba(255,255,255,0.6)' }}>全屏</Button>
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={handleDownload} style={{ color: 'rgba(255,255,255,0.6)' }}>下载</Button>
          </Space>
        </div>
      )}

      {/* 预览区 */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isPdf && (
          <Document
            file={fullUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<Spin tip="正在加载 PDF..." />}
            error={<div style={{ color: 'red' }}>PDF 加载失败</div>}
          >
            {Array.from(new Array(numPages), (el, index) => {
              const pageNum = index + 1;
              return (
                <div key={`page_${pageNum}`} id={`pdf-page-${pageNum}`} style={{ position: 'relative', marginBottom: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                  <Page
                    pageNumber={pageNum}
                    width={containerWidth || undefined}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadSuccess={(page) => {
                      const viewport = page.getViewport({ scale: 1 });
                      setPageMetrics(prev => ({
                        ...prev,
                        [pageNum]: { width: viewport.width, height: viewport.height, scale: 1 }
                      }));
                    }}
                  />
                  {renderBBoxes(pageNum)}
                </div>
              );
            })}
          </Document>
        )}
        
        {isImage && (
          <div style={{ position: 'relative' }}>
            <img src={fullUrl} alt="合同原文" style={{ maxWidth: '100%', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }} />
          </div>
        )}
      </div>
    </div>
  );
}
