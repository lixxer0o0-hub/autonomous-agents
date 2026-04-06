'use client'

import { useEffect, useState } from 'react'

interface Proposal {
  id: string
  title: string
  source: string
  step_kind: string
  status: string
  created_at: string
}

interface Mission {
  id: string
  title: string
  status: string
  created_at: string
}

interface Step {
  id: string
  mission_id: string
  step_kind: string
  status: string
  created_at: string
}

interface Policy {
  key: string
  value: Record<string, unknown>
}

interface HeartbeatStatus {
  lastCheck: string | null
  status: 'ok' | 'error' | 'unknown'
}

export default function Home() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus>({ lastCheck: null, status: 'unknown' })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'proposals' | 'missions' | 'policies'>('overview')

  // Fetch all data
  const fetchData = async () => {
    try {
      // Fetch proposals
      const proposalsRes = await fetch('/api/ops/proposals?hours=24')
      const proposalsData = await proposalsRes.json()
      setProposals(proposalsData.proposals ?? [])

      // Fetch missions
      const missionsRes = await fetch('/api/ops/heartbeat')
      const missionsData = await missionsRes.json()
      setHeartbeat({
        lastCheck: missionsData.timestamp ?? null,
        status: 'ok'
      })

      // Fetch steps
      const stepsRes = await fetch('/api/ops/steps?status=queued')
      const stepsData = await stepsRes.json()
      setSteps(stepsData.steps ?? [])

      // Fetch policies
      const policiesRes = await fetch('/api/ops/policies')
      const policiesData = await policiesRes.json()
      setPolicies(policiesData.policies ?? [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
      setHeartbeat(prev => ({ ...prev, status: 'error' }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Calculate stats
  const stats = {
    totalProposals: proposals.length,
    pendingProposals: proposals.filter(p => p.status === 'pending').length,
    acceptedProposals: proposals.filter(p => p.status === 'accepted').length,
    rejectedProposals: proposals.filter(p => p.status === 'rejected').length,
    queuedSteps: steps.length,
    autoApproveEnabled: policies.find(p => p.key === 'auto_approve')?.value?.enabled ?? true,
    dailyQuota: policies.find(p => p.key === 'x_daily_quota')?.value?.limit ?? 10,
    tweetsToday: 0 // Would need to fetch from events
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'queued':
      case 'approved':
        return 'bg-yellow-100 text-yellow-800'
      case 'accepted':
      case 'running':
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'succeeded':
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'rejected':
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Autonomous Agents Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm ${
                heartbeat.status === 'ok'
                  ? 'bg-green-100 text-green-800'
                  : heartbeat.status === 'error'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                Heartbeat: {heartbeat.status === 'ok' ? 'Active' : heartbeat.status}
              </span>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'proposals', label: 'Proposals' },
              { id: 'missions', label: 'Missions' },
              { id: 'policies', label: 'Policies' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Total Proposals (24h)</h3>
                <p className="text-3xl font-bold text-gray-900">{stats.totalProposals}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Pending Approval</h3>
                <p className="text-3xl font-bold text-yellow-600">{stats.pendingProposals}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Queued Steps</h3>
                <p className="text-3xl font-bold text-blue-600">{stats.queuedSteps}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">Daily Tweet Quota</h3>
                <p className="text-3xl font-bold text-gray-900">{stats.tweetsToday} / {stats.dailyQuota}</p>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Auto-Approve</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    stats.autoApproveEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {stats.autoApproveEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Heartbeat</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    heartbeat.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {heartbeat.status === 'ok' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Last Check</span>
                  <span className="text-gray-900">
                    {heartbeat.lastCheck ? new Date(heartbeat.lastCheck).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Proposals */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Proposals</h2>
              {proposals.length === 0 ? (
                <p className="text-gray-500">No proposals in the last 24 hours</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Title</th>
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Step Kind</th>
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Source</th>
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Status</th>
                        <th className="text-left py-2 text-sm font-medium text-gray-500">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposals.slice(0, 5).map(proposal => (
                        <tr key={proposal.id} className="border-b border-gray-100">
                          <td className="py-3 text-gray-900">{proposal.title}</td>
                          <td className="py-3 text-gray-600">{proposal.step_kind}</td>
                          <td className="py-3 text-gray-600">{proposal.source}</td>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(proposal.status)}`}>
                              {proposal.status}
                            </span>
                          </td>
                          <td className="py-3 text-gray-600">
                            {new Date(proposal.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Proposals Tab */}
        {activeTab === 'proposals' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">All Proposals</h2>
            {proposals.length === 0 ? (
              <p className="text-gray-500">No proposals found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Title</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Step Kind</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Source</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Proposer</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map(proposal => (
                      <tr key={proposal.id} className="border-b border-gray-100">
                        <td className="py-3 text-gray-900">{proposal.title}</td>
                        <td className="py-3 text-gray-600">{proposal.step_kind}</td>
                        <td className="py-3 text-gray-600">{proposal.source}</td>
                        <td className="py-3 text-gray-600">{proposal.proposer_agent ?? '-'}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(proposal.status)}`}>
                            {proposal.status}
                          </span>
                        </td>
                        <td className="py-3 text-gray-600">
                          {new Date(proposal.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Missions Tab */}
        {activeTab === 'missions' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Queued Steps</h2>
            {steps.length === 0 ? (
              <p className="text-gray-500">No queued steps</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Step Kind</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Mission ID</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Status</th>
                      <th className="text-left py-2 text-sm font-medium text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map(step => (
                      <tr key={step.id} className="border-b border-gray-100">
                        <td className="py-3 text-gray-900">{step.step_kind}</td>
                        <td className="py-3 text-gray-600 font-mono text-sm">
                          {step.mission_id.slice(0, 8)}...
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(step.status)}`}>
                            {step.status}
                          </span>
                        </td>
                        <td className="py-3 text-gray-600">
                          {new Date(step.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">System Policies</h2>
            <div className="space-y-4">
              {policies.map(policy => (
                <div key={policy.key} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-medium text-blue-600 mb-2">{policy.key}</h3>
                  <pre className="bg-gray-50 p-3 rounded text-sm text-gray-800 overflow-x-auto">
                    {JSON.stringify(policy.value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
