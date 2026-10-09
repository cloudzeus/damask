import { FamilyHub, familyBySlug, familyMetadata } from '../_components/family-hub'

export const revalidate = 3600
export const generateMetadata = () => familyMetadata('anaptyxiakos-nomos')

export default function Page() {
  return <FamilyHub page={familyBySlug('anaptyxiakos-nomos')} />
}
