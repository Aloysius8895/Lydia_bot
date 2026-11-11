export class DriveSyncError extends Error {
 code:string;
 constructor(code:string){super(code);this.name='DriveSyncError';this.code=code;}
}
export function publicError(error:unknown){return error instanceof DriveSyncError?error.code:'DRIVE_OPERATION_FAILED';}
