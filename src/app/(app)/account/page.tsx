import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/ui/page-header'
import { AccountForms } from './account-forms'

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true, email: true, phone: true, mobile: true, address: true, city: true, createdAt: true,
      role: { select: { name: true } },
    },
  })
  if (!user) redirect('/login')

  return (
    <div>
      <PageHeader breadcrumb={<>Λογαριασμός <span aria-hidden>›</span></>} title="Ο λογαριασμός μου" />
      <AccountForms
        user={{
          name: user.name,
          email: user.email,
          phone: user.phone ?? '',
          mobile: user.mobile ?? '',
          address: user.address ?? '',
          city: user.city ?? '',
          role: user.role.name,
          since: user.createdAt.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }),
        }}
      />
    </div>
  )
}
