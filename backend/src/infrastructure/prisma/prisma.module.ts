import { Global, Module } from '@nestjs/common';

import { UNIT_OF_WORK } from '../../shared/contracts';
import { PrismaService } from './prisma.service';
import { TransactionManager } from './transaction.manager';

/**
 * Global because every module that persists anything needs it, and threading
 * an import of the same module through thirty feature modules communicates
 * nothing. The *dependency rule* is still enforced by ESLint: a `domain/` file
 * importing `PrismaService` is a lint error, global provider or not.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    TransactionManager,
    // The boundary, published so `application/` can declare one without
    // importing `infrastructure/` — see `shared/contracts/unit-of-work.contract.ts`.
    { provide: UNIT_OF_WORK, useExisting: TransactionManager },
  ],
  exports: [PrismaService, TransactionManager, UNIT_OF_WORK],
})
export class PrismaModule {}
