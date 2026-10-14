/**
 * Create Sub User.
 *
 *   ( ) User   the sub users - list, view, and Create Sub User (SubUserList)
 *   (o) Role   the company's roles - list, create, edit, delete (RoleList)
 *
 * Role is selected on arrival: a sub user is given one of a company's roles,
 * so the roles come first.
 */

import { useState } from 'react'

import { Label } from '@/Components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/Components/ui/radio-group'
import { CREATE_SUB_USER_LINK } from '@/Constants/navigation'
import RoleList from '../Components/RoleList'
import SubUserList from '../Components/SubUserList'

const TABS = [
  { value: 'user', label: 'User' },
  { value: 'role', label: 'Role' },
]

export default function CreateSubUser() {
  const [tab, setTab] = useState('user')

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-brand sm:text-2xl">{CREATE_SUB_USER_LINK.label}</h1>
        <p className="text-sm text-muted-foreground">
          Give your team their own logins, with a role, modules and permissions for each company.
        </p>
      </div>

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

      {tab === 'role' ? <RoleList /> : <SubUserList />}
    </div>
  )
}
