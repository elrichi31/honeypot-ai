import type { PrismaClient } from '@prisma/client'

export class SensorControlCredentialRepository {
  constructor(private prisma: PrismaClient) {}

  upsert(args: { sensorId: string; secretHash: string; secretPrefix: string; createdBy: string }) {
    return this.prisma.sensorControlCredential.upsert({
      where: { sensorId: args.sensorId },
      create: {
        sensorId: args.sensorId,
        secretHash: args.secretHash,
        secretPrefix: args.secretPrefix,
        createdBy: args.createdBy,
      },
      update: {
        secretHash: args.secretHash,
        secretPrefix: args.secretPrefix,
        rotatedAt: new Date(),
        revokedAt: null,
      },
    })
  }

  findBySensorId(sensorId: string) {
    return this.prisma.sensorControlCredential.findUnique({
      where: { sensorId },
      select: { secretHash: true, revokedAt: true },
    })
  }

  revoke(sensorId: string) {
    return this.prisma.sensorControlCredential.updateMany({
      where: { sensorId },
      data: { revokedAt: new Date() },
    })
  }
}
