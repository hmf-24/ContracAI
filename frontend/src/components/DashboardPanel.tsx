import React, { useState, useEffect, useRef } from 'react';
import { Row, Col, Typography, Skeleton, message, Button, Input, Space } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell
} from 'recharts';
import { getGlobalDashboard, getProjectDashboard } from '../api';
import { DownloadOutlined, FileExcelOutlined, SearchOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

const { Title, Text } = Typography;

const COLORS = ['var(--neon-cyan)', 'var(--neon-green)', '#FADB14', '#FF4D4F', '#722ED1', '#1890FF'];

export default function DashboardPanel() {
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'global' | 'project'>('global');
  const [globalData, setGlobalData] = useState<any>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [searchText, setSearchText] = useState('');
  
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGlobalData();
  }, []);

  async function loadGlobalData() {
    setLoading(true);
    try {
      const res = await getGlobalDashboard();
      if (res.status === 'success') {
        setGlobalData(res);
        setViewMode('global');
      }
    } catch {
      message.error('无法加载全局看板数据');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchProject() {
    if (!searchText.trim()) {
      return loadGlobalData();
    }
    setLoading(true);
    try {
      const res = await getProjectDashboard(searchText.trim());
      if (res.status === 'success') {
        setProjectData(res);
        setViewMode('project');
      }
    } catch (e: any) {
      message.error('未找到该项目或加载失败');
    } finally {
      setLoading(false);
    }
  }

  // 导出为图片
  const exportAsImage = async () => {
    if (!dashboardRef.current) return;
    try {
      message.loading({ content: '正在生成报表...', key: 'exporting' });
      const canvas = await html2canvas(dashboardRef.current, {
        backgroundColor: '#0a0f1c', // 强制暗黑背景，防止透明发白
        scale: 2 // 高清
      });
      const link = document.createElement('a');
      link.download = `收支看板_${viewMode === 'global' ? '全局' : projectData?.project_name}_${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      message.success({ content: '导出成功', key: 'exporting' });
    } catch (e) {
      message.error({ content: '导出失败', key: 'exporting' });
    }
  };

  // 导出为 Excel
  const exportAsExcel = () => {
    let wsData: any[] = [];
    let title = '';
    
    if (viewMode === 'global' && globalData) {
      title = '全局收支平衡表';
      wsData.push(['月份', '总收入(元)', '总支出(元)', '当月净流入(元)']);
      globalData.chart_data.forEach((d: any) => {
        wsData.push([d.month, d.income, d.expense, d.profit]);
      });
    } else if (viewMode === 'project' && projectData) {
      title = `项目_${projectData.project_name}_收支平衡表`;
      wsData.push(['合同编号', '合同名称', '收支方向', '合同总额', '已付款/已收款']);
      projectData.contracts.forEach((c: any) => {
        wsData.push([
          c['合同编号'],
          c['合同名称'],
          c['direction'] === 'income' ? '收入' : '支出',
          c['合同金额'],
          c['付款合计'] || 0
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${title}.xlsx`);
  };

  if (loading) {
    return <div style={{ padding: 32, height: '100vh' }}><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto', padding: '0 24px 40px' }}>
      
      {/* 顶部控制栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 16 }}>
        <Space>
          {viewMode === 'project' && (
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={loadGlobalData} style={{ color: '#fff' }}>
              返回全局
            </Button>
          )}
          <Input.Search 
            placeholder="搜索项目名称查看独立看板..." 
            onSearch={handleSearchProject}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 300 }}
            enterButton
          />
        </Space>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportAsImage} ghost style={{ borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)' }}>
            导出报表 (图片)
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={exportAsExcel} ghost style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}>
            导出数据 (Excel)
          </Button>
        </Space>
      </div>

      {/* 待导出容器 */}
      <div ref={dashboardRef} style={{ padding: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 className="page-title">{viewMode === 'global' ? '公司级全局收支看板' : `项目看板 - ${projectData?.project_name}`}</h1>
          <p className="page-subtitle">实时业财数据追踪与现金流健康预警</p>
        </div>

        {viewMode === 'global' && globalData && (
          <>
            <Row gutter={[24, 24]}>
              <Col span={8}>
                <div className="glass-panel glow-top-cyan" style={{ padding: '24px' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>累计总收入</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--neon-cyan)', marginBottom: 4 }}>
                    ¥{(globalData.summary.total_income / 10000).toFixed(2)} <span style={{fontSize: 16}}>万</span>
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div className="glass-panel glow-top-orange" style={{ padding: '24px' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>累计总支出</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--neon-orange)', marginBottom: 4 }}>
                    ¥{(globalData.summary.total_expense / 10000).toFixed(2)} <span style={{fontSize: 16}}>万</span>
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div className="glass-panel glow-top-green" style={{ padding: '24px' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>总利润池 (收入 - 支出)</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: globalData.summary.net_profit >= 0 ? 'var(--neon-green)' : '#FF4D4F', marginBottom: 4 }}>
                    ¥{(globalData.summary.net_profit / 10000).toFixed(2)} <span style={{fontSize: 16}}>万</span>
                  </div>
                </div>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col span={16}>
                <div className="glass-panel glow-top-purple" style={{ padding: 24, height: 420 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>月度收支双轴图 (元)</Text>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={globalData.chart_data} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                      <RechartsTooltip contentStyle={{ background: 'rgba(10,20,45,0.9)', border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: 8 }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="income" name="收入" fill="var(--neon-cyan)" radius={[4, 4, 0, 0]} barSize={30} />
                      <Bar yAxisId="left" dataKey="expense" name="支出" fill="var(--neon-orange)" radius={[4, 4, 0, 0]} barSize={30} />
                      <Line yAxisId="left" type="monotone" dataKey="profit" name="当月净流入" stroke="var(--neon-green)" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Col>
              
              <Col span={8}>
                <div className="glass-panel glow-top-cyan" style={{ padding: 24, height: 420, overflowY: 'auto' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>资金敞口预警</Text>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>应收未收总额 (资金垫付风险)</div>
                    <div style={{ color: 'var(--neon-cyan)', fontSize: 24, fontWeight: 'bold' }}>
                      ¥{(globalData.advanced_metrics?.cash_exposure?.unpaid_receivable / 10000 || 0).toFixed(2)}万
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>应付未付总额 (债务逾期风险)</div>
                    <div style={{ color: 'var(--neon-orange)', fontSize: 24, fontWeight: 'bold' }}>
                      ¥{(globalData.advanced_metrics?.cash_exposure?.unpaid_payable / 10000 || 0).toFixed(2)}万
                    </div>
                  </div>
                  
                  {globalData.advanced_metrics?.cash_exposure?.unpaid_receivable > globalData.advanced_metrics?.cash_exposure?.unpaid_payable ? (
                    <Text style={{ color: '#FF4D4F', fontSize: 12 }}>⚠️ 警告：垫资缺口较大，请重点催收应收款</Text>
                  ) : (
                    <Text style={{ color: 'var(--neon-green)', fontSize: 12 }}>✅ 良好：应付款充足，现金流暂无重大垫资风险</Text>
                  )}
                </div>
              </Col>
            </Row>

            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col span={12}>
                <div className="glass-panel" style={{ padding: 24, height: 350, overflowY: 'auto' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>Top 5 现金流健康度项目</Text>
                  {globalData.advanced_metrics?.top_projects?.map((p: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                      <div style={{ color: '#fff' }}>
                        <span style={{ display: 'inline-block', width: 20, color: 'rgba(255,255,255,0.3)' }}>{i+1}.</span> 
                        {p.name}
                      </div>
                      <div style={{ color: p.profit >= 0 ? 'var(--neon-green)' : '#FF4D4F', fontWeight: 'bold' }}>
                        ¥{(p.profit / 10000).toFixed(2)}万
                      </div>
                    </div>
                  ))}
                  {(!globalData.advanced_metrics?.top_projects || globalData.advanced_metrics?.top_projects.length === 0) && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 50 }}>暂无项目数据</div>
                  )}
                </div>
              </Col>
              
              <Col span={12}>
                <div className="glass-panel" style={{ padding: 24, height: 350, overflowY: 'auto' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>Top 5 供应商依赖度</Text>
                  {globalData.advanced_metrics?.top_suppliers?.map((s: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                      <div style={{ color: '#fff' }}>
                        <span style={{ display: 'inline-block', width: 20, color: 'rgba(255,255,255,0.3)' }}>{i+1}.</span> 
                        {s.name}
                      </div>
                      <div style={{ color: 'var(--neon-orange)', fontWeight: 'bold' }}>
                        ¥{(s.amount / 10000).toFixed(2)}万
                      </div>
                    </div>
                  ))}
                  {(!globalData.advanced_metrics?.top_suppliers || globalData.advanced_metrics?.top_suppliers.length === 0) && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 50 }}>暂无供应商数据</div>
                  )}
                </div>
              </Col>
            </Row>
          </>
        )}

        {viewMode === 'project' && projectData && (
          <>
            <Row gutter={[24, 24]}>
              <Col span={12}>
                <div className="glass-panel glow-top-cyan" style={{ padding: '24px' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>项目预期毛利润 (合同差额)</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--neon-cyan)', marginBottom: 4 }}>
                    ¥{(projectData.metrics.expected_profit / 10000).toFixed(2)} <span style={{fontSize: 16}}>万</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>总收入: {projectData.metrics.total_income} | 总支出: {projectData.metrics.total_expense}</div>
                </div>
              </Col>
              <Col span={12}>
                <div className="glass-panel glow-top-orange" style={{ padding: '24px' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>实际现金流缺口 (实收 - 实付)</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: projectData.metrics.cash_flow_gap >= 0 ? 'var(--neon-green)' : '#FF4D4F', marginBottom: 4 }}>
                    ¥{(projectData.metrics.cash_flow_gap / 10000).toFixed(2)} <span style={{fontSize: 16}}>万</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>已收款: {projectData.metrics.paid_income} | 已付款: {projectData.metrics.paid_expense}</div>
                </div>
              </Col>
            </Row>
            
            <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
              <Col span={24}>
                <div className="glass-panel" style={{ padding: 24 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>项目下属合同清单</Text>
                  {projectData.contracts.map((c: any, idx: number) => (
                    <div key={idx} style={{ 
                      padding: 16, 
                      background: 'rgba(255,255,255,0.02)', 
                      borderRadius: 8, 
                      marginBottom: 8,
                      borderLeft: `4px solid ${c.direction === 'income' ? 'var(--neon-cyan)' : 'var(--neon-orange)'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{c['合同名称']}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{c['对方单位名称']} | {c['合同编号']}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: c.direction === 'income' ? 'var(--neon-cyan)' : 'var(--neon-orange)', fontSize: 18, fontWeight: 700 }}>
                            ¥{c['合同金额']}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                            {c.direction === 'income' ? '收入' : '支出'} | 已结: ¥{c['付款合计'] || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </>
        )}

      </div>
    </div>
  );
}
