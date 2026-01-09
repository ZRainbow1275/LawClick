"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/Button"
import { CreateCaseWizard } from "@/components/cases/CreateCaseWizard"

export function ConflictCheckWizard() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                新建案件（冲突检索）
            </Button>

            <CreateCaseWizard
                open={open}
                onOpenChange={setOpen}
            />
        </>
    )
}
