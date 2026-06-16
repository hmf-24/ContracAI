import { useState, useEffect, useMemo } from 'react';
import { Row, Col, Typography, Skeleton, message, Progress } from 'antd';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, LineChart, Line, ReferenceLine
} from 'recharts';
import { getContracts, getCashflowSimulation } from '../api';

const { Title, Text } = Typography;

const COLORS = ['var(--neon-cyan)', 'var(--neon-green)', '#FADB14', '#FF4D4F', '#722ED1', '#1890FF'];

export default function DashboardPanel() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [res, simRes] = await Promise.all([
        getContracts(),
        getCashflowSimulation()
      ]);
      setContracts(res.contracts || []);
      setSimulationData(simRes.data || null);
    } catch {
      message.error('无法加载台账及推演数据');
    } finally {
      setLoading(false);
    }
  }

  // --- 数据聚合计算 ---
  const stats = useMemo(() => {
    let totalAmount = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let newThisMonth = 0;
    let maxAmount = 0;
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const statusMap: Record<string, number> = {};
    const typeMap: Record<string, number> = {};
    const personMap: Record<string, number> = {};
    const supplierMap: Record<string, number> = {};
    const monthMap: Record<string, number> = {};

    contracts.forEach(c => {
      const amt = Number(c['合同金额']) || 0;
      totalAmount += amt;
      totalPaid += Number(c['付款合计\n（自动计算）'] || c['付款合计']) || 0;
      totalUnpaid += Number(c['合同未付款合计\n（自动计算）'] || c['合同未付款合计']) || 0;
      
      if (amt > maxAmount) maxAmount = amt;

      const signDate = c['签订时间'] || '';
      if (signDate && signDate.length >= 7) {
        const yyyyMM = signDate.substring(0, 7);
        monthMap[yyyyMM] = (monthMap[yyyyMM] || 0) + amt;
        if (yyyyMM === currentMonth) {
          newThisMonth += 1;
        }
      }

      const status = c['合同状态'] || '未知状态';
      statusMap[status] = (statusMap[status] || 0) + 1;

      const type = c['合同类型'] || '通用';
      typeMap[type] = (typeMap[type] || 0) + 1;

      const person = c['经办人'] || '未登记';
      personMap[person] = (personMap[person] || 0) + amt;
      
      const supplier = c['对方单位名称'] || '未知';
      supplierMap[supplier] = (supplierMap[supplier] || 0) + amt;
    });

    const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }));
    const radarData = Object.entries(typeMap).map(([name, value]) => ({ subject: name, A: value, fullMark: contracts.length }));
    
    const personData = Object.entries(personMap)
      .map(([name, value]) => ({ name, value: Math.round(value / 10000) })) // 万为单位
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // 月度趋势
    const monthData = Object.keys(monthMap).sort().map(m => ({
      month: m,
      amount: Math.round(monthMap[m] / 10000) // 万为单位
    }));

    // 供应商占比
    const sortedSuppliers = Object.entries(supplierMap).sort((a, b) => b[1] - a[1]);
    const topSuppliers = sortedSuppliers.slice(0, 5).map(s => ({ name: s[0].substring(0, 8) + '...', value: s[1] }));
    if (sortedSuppliers.length > 5) {
      const rest = sortedSuppliers.slice(5).reduce((acc, curr) => acc + curr[1], 0);
      topSuppliers.push({ name: '其他', value: rest });
    }

    // 找出最大金额未付款合同
    const topUnpaid = [...contracts].sort((a, b) => 
      (Number(b['合同未付款合计\n（自动计算）'] || b['合同未付款合计']) || 0) - 
      (Number(a['合同未付款合计\n（自动计算）'] || a['合同未付款合计']) || 0)
    )[0];
    
    const avgAmount = contracts.length > 0 ? totalAmount / contracts.length : 0;

    return { 
      totalAmount, totalPaid, totalUnpaid, newThisMonth, maxAmount, avgAmount,
      statusData, radarData, personData, monthData, topSuppliers, topUnpaid 
    };
  }, [contracts]);

  if (loading) {
    return <div style={{ padding: 32, height: '100vh' }}><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  const overallProgress = stats.totalAmount > 0 ? ((stats.totalPaid / stats.totalAmount) * 100).toFixed(1) : 0;

  return (
    <div style={{ height: 'calc(100vh - 80px)', overflowY: 'auto', padding: '0 24px 40px' }}>
      
      {/* Title Area */}
      <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 16 }}>
        <h1 className="page-title">采购智能分析</h1>
        <p className="page-subtitle">实时合同追踪与资金运作全景视图</p>
      </div>

      {/* Cashflow Simulation */}
      {simulationData && (
        <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <div className="glass-panel glow-top-cyan" style={{ padding: 24 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, display: 'block', marginBottom: 16 }}>
                未来 6 个月现金流沙盘推演预警
              </Text>
              
              <Row gutter={[24, 24]}>
                <Col span={16}>
                  <div style={{ height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={simulationData.chart_data} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.6)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.6)' }} axisLine={false} tickLine={false} />
                        <ReferenceLine y={200000} label="安全底线" stroke="var(--neon-orange)" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="cash" name="预估现金(元)" stroke="var(--neon-cyan)" strokeWidth={3} dot={{ r: 6, fill: '#0a0f1c', stroke: 'var(--neon-cyan)', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                    {simulationData.warnings?.length > 0 ? (
                      <div className="glass-panel-active" style={{ padding: 24, borderRadius: 12, border: '1px solid var(--neon-orange)' }}>
                        <div style={{ fontSize: 18, color: 'var(--neon-orange)', marginBottom: 16, fontWeight: 600 }}>
                          资金链预警触发
                        </div>
                        {simulationData.warnings.map((warn: string, idx: number) => (
                          <div key={idx} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: '1.6', marginBottom: 16 }}>
                            {warn}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="glass-panel-active" style={{ padding: 24, borderRadius: 12, border: '1px solid var(--neon-green)' }}>
                        <div style={{ fontSize: 18, color: 'var(--neon-green)', fontWeight: 600 }}>
                          资金流健康
                        </div>
                      </div>
                    )}
                  </div>
                </Col>
              </Row>
            </div>
          </Col>
        </Row>
      )}

      {/* Row 1: KPI Cards */}
      <Row gutter={[24, 24]}>
        <Col span={6}>
          <div className="glass-panel glow-top-cyan" style={{ padding: '24px' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>合同总规模 / 总数</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              ¥{(stats.totalAmount/10000).toFixed(0)} <span style={{fontSize: 16}}>万</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--neon-cyan)' }}>共计 {contracts.length} 份合同在管</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="glass-panel glow-top-green" style={{ padding: '24px', border: '1px solid rgba(0,255,163,0.3)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>整体已付流转</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--neon-green)', marginBottom: 4 }}>
              {overallProgress}%
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>已付 ¥{(stats.totalPaid/10000).toFixed(0)}万</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="glass-panel glow-top-yellow" style={{ padding: '24px', border: '1px solid rgba(255,77,79,0.3)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>资金风险敞口 (未付)</div>
            <div className="neon-text-orange" style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
              ¥{(stats.totalUnpaid/10000).toFixed(0)} <span style={{fontSize: 16}}>万</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>即将面临支出压力</div>
          </div>
        </Col>
        <Col span={6}>
          <div className="glass-panel glow-top-purple" style={{ padding: '24px' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>本月新增 / 平均单笔</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {stats.newThisMonth} <span style={{fontSize: 16}}>份</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>均单 ¥{(stats.avgAmount/10000).toFixed(1)}万</div>
          </div>
        </Col>
      </Row>

      {/* Row 2: Trend & Priority */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        {/* Trend Area Chart */}
        <Col span={16}>
          <div className="glass-panel glow-top-cyan" style={{ padding: 24, height: 350 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>月度签约金额趋势 (万元)</Text>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.monthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--neon-cyan)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--neon-cyan)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <RechartsTooltip contentStyle={{ background: 'rgba(10,20,45,0.9)', border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: 8 }} />
                <Area type="monotone" dataKey="amount" stroke="var(--neon-cyan)" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" activeDot={{ r: 8, fill: 'var(--neon-cyan)', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Col>

        {/* Top Priority Target */}
        <Col span={8}>
          <div className="glass-panel glow-top-yellow" style={{ padding: 24, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 20 }}>高优重点处理合同 →</Text>
            
            {stats.topUnpaid ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="glass-panel-active" style={{ padding: 20, marginBottom: 24, borderRadius: 12, border: '1px solid var(--neon-orange)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8, wordBreak: 'break-all' }}>
                    {stats.topUnpaid['合同编号'] || '无编号'}
                  </div>
                  <div className="neon-text-orange" style={{ fontSize: 14 }}>重点关注对象：大额欠款</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '16px 0', fontSize: 14 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)' }}>供应商</Text>
                  <Text style={{ color: '#fff', textAlign: 'right' }}>{stats.topUnpaid['对方单位名称']}</Text>
                  
                  <Text style={{ color: 'rgba(255,255,255,0.45)' }}>未付金额</Text>
                  <Text className="neon-text-orange" style={{ textAlign: 'right', fontWeight: 600, fontSize: 16 }}>
                    ¥{Number(stats.topUnpaid['合同未付款合计\n（自动计算）'] || stats.topUnpaid['合同未付款合计']).toLocaleString()}
                  </Text>
                  
                  <Text style={{ color: 'rgba(255,255,255,0.45)' }}>截止日期</Text>
                  <Text style={{ color: '#fff', textAlign: 'right' }}>{stats.topUnpaid['截止日期'] || '未设置'}</Text>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>
                暂无重点预警
              </div>
            )}
          </div>
        </Col>
      </Row>

      {/* Row 3: 3 Columns of detailed charts */}
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        
        {/* Supplier Pie */}
        <Col span={8}>
          <div className="glass-panel glow-top-purple" style={{ padding: 24, height: 350 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 8 }}>供应商敞口 (资金占比)</Text>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.topSuppliers}
                  cx="50%" cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({name, percent}) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {stats.topSuppliers.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(val: any) => `¥${(Number(val)/10000).toFixed(1)}万`} contentStyle={{ background: 'rgba(10,20,45,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Col>

        {/* Handlers Bar */}
        <Col span={8}>
          <div className="glass-panel glow-top-green" style={{ padding: 24, height: 350 }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 8 }}>经办人资金流转 (万元)</Text>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.personData} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }} width={80} />
                <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ background: 'rgba(10,20,45,0.9)', border: '1px solid rgba(0,255,163,0.3)', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {stats.personData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="var(--neon-green)" style={{ filter: 'drop-shadow(0px 0px 4px rgba(0,255,163,0.5))' }}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Col>

        {/* Status Donut */}
        <Col span={8}>
          <div className="glass-panel glow-top-cyan" style={{ padding: 24, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, display: 'block', marginBottom: 8 }}>合同状态分布</Text>
            <div style={{ flex: 1, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusData}
                    cx="50%" cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {stats.statusData.map((entry, index) => {
                      let color = '#1890FF';
                      if (entry.name === '执行中') color = 'var(--neon-green)';
                      if (entry.name === '已结项') color = 'rgba(255,255,255,0.3)';
                      if (entry.name === '异常挂起') color = 'var(--neon-orange)';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: 'rgba(10,20,45,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{contracts.length}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>总计(份)</div>
              </div>
            </div>
            {/* Status Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
              {stats.statusData.map((s, i) => {
                let color = '#1890FF';
                if (s.name === '执行中') color = 'var(--neon-green)';
                if (s.name === '已结项') color = 'rgba(255,255,255,0.3)';
                if (s.name === '异常挂起') color = 'var(--neon-orange)';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    {s.name} ({s.value})
                  </div>
                )
              })}
            </div>
          </div>
        </Col>

      </Row>

    </div>
  );
}
