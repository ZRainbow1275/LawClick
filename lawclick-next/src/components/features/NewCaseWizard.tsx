"use client"

import { useState } from "react"
import { Briefcase } from "lucide-react"

import { Button } from "@/components/ui/Button"
import { CreateCaseWizard } from "@/components/cases/CreateCaseWizard"

export function NewCaseWizard() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Briefcase className="h-4 w-4 mr-2" />
                新建案件
            </Button>

            <CreateCaseWizard
                open={open}
                onOpenChange={setOpen}
            />
        </>
    )
}
