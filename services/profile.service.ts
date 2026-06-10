import { Prisma, Profile, ProfileStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROFILE_SLUG,
  MUSIC_PROFILE_SLUG,
  PROFILE_DEFAULTS,
  buildDefaultPromptForProfile,
} from "@/lib/profile-defaults";

type EnsureProfilesResult = {
  restoration: Profile;
  music: Profile;
};

function normalize(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function musicPromptConfig() {
  return {
    note: "Perfil criado, aguardando WhatsApp e configuração comercial definitiva.",
  } satisfies Prisma.JsonObject;
}

class ProfileService {
  private initialized = false;

  private async ensurePromptForProfile(profileId: string, slug: string) {
    const existingPrompt = await prisma.prompt.findFirst({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
    });

    if (existingPrompt) return existingPrompt;

    const promptSeed = buildDefaultPromptForProfile(slug);

    return prisma.prompt.create({
      data: {
        profileId,
        ...promptSeed,
      },
    });
  }

  async ensureDefaultProfiles(force = false): Promise<EnsureProfilesResult> {
    if (this.initialized && !force) {
      const [restoration, music] = await Promise.all([
        prisma.profile.findUniqueOrThrow({
          where: { slug: DEFAULT_PROFILE_SLUG },
        }),
        prisma.profile.findUniqueOrThrow({
          where: { slug: MUSIC_PROFILE_SLUG },
        }),
      ]);

      return { restoration, music };
    }

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });

    const restoration = await prisma.profile.upsert({
      where: { slug: PROFILE_DEFAULTS.restoration.slug },
      update: {
        name: PROFILE_DEFAULTS.restoration.name,
        description: PROFILE_DEFAULTS.restoration.description,
        pixKey: PROFILE_DEFAULTS.restoration.pixKey,
        pixName: PROFILE_DEFAULTS.restoration.pixName,
        pixBank: PROFILE_DEFAULTS.restoration.pixBank,
        whatsappNumber: PROFILE_DEFAULTS.restoration.whatsappNumber,
        whatsappSessionName:
          normalize(settings.evolutionInstanceName) ??
          PROFILE_DEFAULTS.restoration.whatsappSessionName,
      },
      create: {
        name: PROFILE_DEFAULTS.restoration.name,
        slug: PROFILE_DEFAULTS.restoration.slug,
        description: PROFILE_DEFAULTS.restoration.description,
        status: PROFILE_DEFAULTS.restoration.status,
        aiEnabled: false,
        pixKey: PROFILE_DEFAULTS.restoration.pixKey,
        pixName: PROFILE_DEFAULTS.restoration.pixName,
        pixBank: PROFILE_DEFAULTS.restoration.pixBank,
        whatsappNumber: PROFILE_DEFAULTS.restoration.whatsappNumber,
        whatsappSessionName:
          normalize(settings.evolutionInstanceName) ??
          PROFILE_DEFAULTS.restoration.whatsappSessionName,
      },
    });

    const music = await prisma.profile.upsert({
      where: { slug: PROFILE_DEFAULTS.music.slug },
      update: {
        name: PROFILE_DEFAULTS.music.name,
        description: PROFILE_DEFAULTS.music.description,
        promptConfig: musicPromptConfig(),
        whatsappSessionName: "musica-personalizada",
      },
      create: {
        name: PROFILE_DEFAULTS.music.name,
        slug: PROFILE_DEFAULTS.music.slug,
        description: PROFILE_DEFAULTS.music.description,
        status: PROFILE_DEFAULTS.music.status,
        aiEnabled: false,
        promptConfig: musicPromptConfig(),
        whatsappSessionName: "musica-personalizada",
      },
    });

    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { profileId: null },
        data: { profileId: restoration.id },
      }),
      prisma.prompt.updateMany({
        where: { profileId: null },
        data: { profileId: restoration.id },
      }),
    ]);

    await Promise.all([
      this.ensurePromptForProfile(restoration.id, restoration.slug),
      this.ensurePromptForProfile(music.id, music.slug),
    ]);

    this.initialized = true;
    return { restoration, music };
  }

  async getProfiles() {
    await this.ensureDefaultProfiles();

    const profiles = await prisma.profile.findMany({
      include: {
        _count: {
          select: {
            leads: true,
            prompts: true,
          },
        },
      },
    });

    return profiles.sort((left, right) => {
      if (left.slug === DEFAULT_PROFILE_SLUG) return -1;
      if (right.slug === DEFAULT_PROFILE_SLUG) return 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });
  }

  async getProfileBySlug(slug?: string | null) {
    await this.ensureDefaultProfiles();

    if (slug) {
      const profile = await prisma.profile.findUnique({
        where: { slug },
      });

      if (profile) return profile;
    }

    return prisma.profile.findUniqueOrThrow({
      where: { slug: DEFAULT_PROFILE_SLUG },
    });
  }

  async getDefaultProfile() {
    return this.getProfileBySlug(DEFAULT_PROFILE_SLUG);
  }

  async resolveProfile(slug?: string | null) {
    const [profiles, activeProfile] = await Promise.all([
      this.getProfiles(),
      this.getProfileBySlug(slug),
    ]);

    return {
      profiles,
      activeProfile,
      activeSlug: activeProfile.slug,
    };
  }

  async setAiEnabled(profileId: string, enabled: boolean) {
    return prisma.profile.update({
      where: { id: profileId },
      data: {
        aiEnabled: enabled,
        status: enabled ? ProfileStatus.ACTIVE : ProfileStatus.PAUSED,
      },
    });
  }
}

export const profileService = new ProfileService();
