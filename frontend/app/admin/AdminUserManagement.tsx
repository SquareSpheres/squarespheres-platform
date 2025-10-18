'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { 
  Trash2, 
  Search, 
  Filter, 
  AlertTriangle,
  Users,
  UserCheck,
  UserX,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { UserAnalytics } from './components/UserAnalytics'

interface User {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  emailAddresses: Array<{ emailAddress: string }>
  createdAt: string
  lastSignInAt: string | null
  publicMetadata: Record<string, any>
  unsafeMetadata: Record<string, any>
}

interface UserStats {
  total: number
  anonymous: number
  regular: number
  active: number
}

export function AdminUserManagement() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'anonymous' | 'regular' | 'active'>('all')
  const [stats, setStats] = useState<UserStats>({ total: 0, anonymous: 0, regular: 0, active: 0 })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)


  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      
          const response = await fetch('/api/admin/users/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      
      const data = await response.json()
      setUsers(data.users || [])
      setFilteredUsers(data.users || [])
      
  
      const userStats = {
        total: data.users?.length || 0,
        anonymous: data.users?.filter((u: User) => u.unsafeMetadata?.isAnonymous).length || 0,
        regular: data.users?.filter((u: User) => !u.unsafeMetadata?.isAnonymous).length || 0,
        active: data.users?.filter((u: User) => u.lastSignInAt && new Date(u.lastSignInAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length || 0,
      }
      setStats(userStats)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    let filtered = users

 
    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.emailAddresses?.[0]?.emailAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }


    switch (filterType) {
      case 'anonymous':
        filtered = filtered.filter(user => user.unsafeMetadata?.isAnonymous)
        break
      case 'regular':
        filtered = filtered.filter(user => !user.unsafeMetadata?.isAnonymous)
        break
      case 'active':
        filtered = filtered.filter(user => 
          user.lastSignInAt && 
          new Date(user.lastSignInAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        )
        break
    }

    setFilteredUsers(filtered)
  }, [users, searchTerm, filterType])

 
  useEffect(() => {
    fetchUsers()
  }, [])


  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const selectAllUsers = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)))
    }
  }


  const deleteSelectedUsers = async () => {
    if (selectedUsers.size === 0) return
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedUsers.size} user(s)? This action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      setActionLoading(true)
      setError(null)
      
          const response = await fetch('/api/admin/users/', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete users')
      }
      
      setSuccess(`Successfully deleted ${selectedUsers.size} user(s)`)
      setSelectedUsers(new Set())
      await fetchUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete users')
    } finally {
      setActionLoading(false)
    }
  }

  const deleteAllAnonymous = async () => {
    const anonymousUsers = users.filter(u => u.unsafeMetadata?.isAnonymous)
    if (anonymousUsers.length === 0) return
    
    const confirmed = window.confirm(
      `Are you sure you want to delete ALL ${anonymousUsers.length} anonymous users? This action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      setActionLoading(true)
      setError(null)
      
          const response = await fetch('/api/admin/users/', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userIds: anonymousUsers.map(u => u.id),
          deleteAllAnonymous: true 
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete anonymous users')
      }
      
      setSuccess(`Successfully deleted ${anonymousUsers.length} anonymous user(s)`)
      await fetchUsers() 
    } catch (err: any) {
      setError(err.message || 'Failed to delete anonymous users')
    } finally {
      setActionLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading users...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Total Users</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-orange-500" />
            <span className="text-sm font-medium">Anonymous</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.anonymous}</p>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium">Regular</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.regular}</p>
        </div>
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-purple-500" />
            <span className="text-sm font-medium">Active (30d)</span>
          </div>
          <p className="text-2xl font-bold mt-1">{stats.active}</p>
        </div>
      </div>

      {/* Analytics */}
      <UserAnalytics users={users} />

      {/* Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">All Users</option>
            <option value="anonymous">Anonymous Only</option>
            <option value="regular">Regular Only</option>
            <option value="active">Active (30d)</option>
          </select>
        </div>
        
        <button
          onClick={fetchUsers}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Filter className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-yellow-800 font-medium">
                {selectedUsers.size} user(s) selected
              </span>
            </div>
            <button
              onClick={deleteSelectedUsers}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium mb-2">Danger Zone</h3>
        <p className="text-red-700 text-sm mb-3">
          These actions are irreversible. Use with extreme caution.
        </p>
        <button
          onClick={deleteAllAnonymous}
          disabled={actionLoading || stats.anonymous === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {actionLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete All Anonymous Users ({stats.anonymous})
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800">{success}</span>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                    onChange={selectAllUsers}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Last Sign In</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-foreground">
                        {user.username || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unnamed'}
                      </div>
                      {user.emailAddresses?.[0]?.emailAddress && (
                        <div className="text-sm text-muted-foreground">
                          {user.emailAddresses[0].emailAddress}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      user.unsafeMetadata?.isAnonymous 
                        ? 'bg-orange-100 text-orange-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.unsafeMetadata?.isAnonymous ? 'Anonymous' : 'Regular'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                    {user.id.slice(0, 8)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No users found matching your criteria.
          </div>
        )}
      </div>
    </div>
  )
}
