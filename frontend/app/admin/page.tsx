import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { AdminUserManagement } from './AdminUserManagement'

export default async function AdminPage() {
  const { userId } = await auth()
  

  if (!userId) {
    redirect('/sign-up/')
  }
  

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const userRole = (user.privateMetadata as any)?.user_role
  
  if (userRole !== 'admin') {
    redirect('/')
  }
  
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">User Management</h1>
        <p className="text-muted-foreground">
          Manage all users in the system. Use with caution - actions cannot be undone.
        </p>
      </div>
      
      <AdminUserManagement />
    </div>
  )
}