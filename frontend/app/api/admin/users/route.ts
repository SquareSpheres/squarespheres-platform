import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/users - Fetch all users
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Fetch user to get privateMetadata and check admin role
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userRole = (user.privateMetadata as any)?.user_role
    
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    // Fetch all users from Clerk with pagination
    let allUsers: any[] = []
    let hasNextPage = true
    let offset = 0
    const limit = 500 // Clerk's max limit per request
    
    while (hasNextPage && allUsers.length < 10000) { // Reasonable limit
      const response = await client.users.getUserList({
        limit,
        offset,
        orderBy: '-created_at'
      })
      
      allUsers = allUsers.concat(response.data)
      
      hasNextPage = response.data.length === limit && allUsers.length < response.totalCount
      offset += limit
    }
    
    return NextResponse.json({ 
      users: allUsers,
      total: allUsers.length
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
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Fetch user to get privateMetadata and check admin role
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userRole = (user.privateMetadata as any)?.user_role
    
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
    
    // Delete users (reuse existing client)
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
