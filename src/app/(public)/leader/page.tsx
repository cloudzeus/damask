import { FamilyHub, familyBySlug, familyMetadata } from '../_components/family-hub'

export const revalidate = 3600
export const generateMetadata = () => familyMetadata('leader')

export default function Page() {
  return <FamilyHub page={familyBySlug('leader')} />
}
