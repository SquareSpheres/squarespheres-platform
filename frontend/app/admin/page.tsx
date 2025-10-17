import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { AdminUserManagement } from './AdminUserManagement'

export default async function AdminPage() {
  const { userId, sessionClaims } = await auth()
  
  // Server-side admin check
  if (!userId) {
    redirect('/sign-up/')
  }
  
  // Check both publicMetadata and metadata (custom session claims)
  const publicMetadata = sessionClaims?.publicMetadata as any
  const customMetadata = sessionClaims?.metadata as any
  const userRole = publicMetadata?.role || customMetadata?.role
  
  if (userRole !== 'admin') {
    console.log('[AdminPage] Non-admin user accessed admin page, redirecting to home')
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