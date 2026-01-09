type EmptyObject = Record<never, never>

export type ActionOk<T extends object = EmptyObject> = { success: true } & T

export type ActionFail<T extends object = EmptyObject> = { success: false; error: string } & T

export type ActionResponse<TOk extends object = EmptyObject, TFail extends object = EmptyObject> =
    | ActionOk<TOk>
    | ActionFail<TFail>
