import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/users - Fetch all users
export async function GET(request: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth()
    
    // Check if user is authenticated
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check if user has admin role in public metadata or custom session claims
    const publicMetadata = sessionClaims?.publicMetadata as any
    const customMetadata = sessionClaims?.metadata as any
    const userRole = publicMetadata?.role || customMetadata?.role
    
    if (userRole !== 'admin') {
      console.log('[AdminAPI] Non-admin user attempted to access admin API')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Fetch all users from Clerk
    const client = await clerkClient()
    const users = await client.users.getUserList({
      limit: 100, // Adjust as needed
      orderBy: '-created_at'
    })
    
    return NextResponse.json({ 
      users: users.data,
      total: users.totalCount 
    })
    
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' }, 
      { status: 500 }
    )
  }
}

// DELETE /api/admin/users - Delete users
export async function DELETE(request: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth()
    
    // Check if user is authenticated
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check if user has admin role in public metadata or custom session claims
    const publicMetadata = sessionClaims?.publicMetadata as any
    const customMetadata = sessionClaims?.metadata as any
    const userRole = publicMetadata?.role || customMetadata?.role
    
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    const body = await request.json()
    const { userIds, deleteAllAnonymous } = body
    
    if (!userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'Invalid user IDs provided' }, 
        { status: 400 }
      )
    }
    
    // Prevent admin from deleting themselves
    if (userIds.includes(userId)) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' }, 
        { status: 400 }
      )
    }
    
    // Delete users
    const client = await clerkClient()
    const deletePromises = userIds.map(async (id: string) => {
      try {
        await client.users.deleteUser(id)
        return { id, success: true }
      } catch (error) {
        console.error(`Error deleting user ${id}:`, error)
        return { id, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
    
    const results = await Promise.all(deletePromises)
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    
    return NextResponse.json({
      message: `Successfully deleted ${successful.length} user(s)`,
      successful: successful.length,
      failed: failed.length,
      errors: failed.length > 0 ? failed : undefined
    })
    
  } catch (error) {
    console.error('Error deleting users:', error)
    return NextResponse.json(
      { error: 'Failed to delete users' }, 
      { status: 500 }
    )
  }
}
