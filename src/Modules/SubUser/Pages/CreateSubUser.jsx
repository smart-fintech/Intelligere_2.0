/**
 * Create Sub User.
 *
 *   ( ) User   Coming Soon, for now
 *   (o) Role   the company's roles - list, create, edit, delete (RoleList)
 *
 * Role is selected on arrival, since it is the part that works.
 */

import { useState } from 'react'

import ComingSoon from '@/Components/Common/ComingSoon'
import { Card } from '@/Components/ui/card'
import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { CREATE_SUB_USER_LINK } from '@/Constants/navigation'
import RoleList from '../Components/RoleList'

const TABS = [
  { value: 'user', label: 'User' },
  { value: 'role', label: 'Role' },
]

export default function CreateSubUser() {
  const [tab, setTab] = useState('role')

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-brand sm:text-2xl">{CREATE_SUB_USER_LINK.label}</h1>

      <RadioGroup
        aria-label="Create a user or a role"
        value={tab}
        onValueChange={setTab}
        className="flex justify-center gap-8"
      >
        {TABS.map(({ value, label }) => (
          <div key={value} className="flex items-center gap-2">
            <RadioGroupItem id={`sub-user-${value}`} value={value} />
            <Label htmlFor={`sub-user-${value}`} className="font-normal">
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {tab === 'role' ? (
        <RoleList />
      ) : (
        <Card className="border-border/70">
          <ComingSoon icon={CREATE_SUB_USER_LINK.icon} title="User" />
        </Card>
      )}
    </div>
  )
}
