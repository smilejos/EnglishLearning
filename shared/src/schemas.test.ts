import { describe, it, expect } from "vitest";
import {
  StatusSchema,
  MaterialTypeSchema,
  UserRoleSchema,
  ManageableRoleSchema,
  PreprovisionUserRequestSchema,
  ArticleSchema,
  ParagraphSchema,
  WordSchema,
  WordExplanationSchema,
  WordLookupRequestSchema,
  WordLookupResponseSchema,
} from "./schemas";

describe("StatusSchema", () => {
  it("接受四個合法狀態", () => {
    for (const s of ["pending", "processing", "done", "failed"]) {
      expect(StatusSchema.parse(s)).toBe(s);
    }
  });

  it("拒絕未知狀態", () => {
    expect(StatusSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("MaterialTypeSchema", () => {
  it("接受 school / extracurricular", () => {
    expect(MaterialTypeSchema.parse("school")).toBe("school");
    expect(MaterialTypeSchema.parse("extracurricular")).toBe("extracurricular");
  });

  it("拒絕其他值", () => {
    expect(MaterialTypeSchema.safeParse("other").success).toBe(false);
  });
});

describe("UserRoleSchema", () => {
  it("接受 admin / reader / reviewer", () => {
    for (const r of ["admin", "reader", "reviewer"]) {
      expect(UserRoleSchema.parse(r)).toBe(r);
    }
  });
});

describe("ManageableRoleSchema", () => {
  it("只接受 reviewer / reader，拒絕 admin", () => {
    expect(ManageableRoleSchema.parse("reviewer")).toBe("reviewer");
    expect(ManageableRoleSchema.parse("reader")).toBe("reader");
    expect(ManageableRoleSchema.safeParse("admin").success).toBe(false);
  });
});

describe("PreprovisionUserRequestSchema", () => {
  it("拒絕非法 email", () => {
    expect(
      PreprovisionUserRequestSchema.safeParse({ email: "x", role: "reviewer" })
        .success,
    ).toBe(false);
  });
  it("接受合法 email + reviewer", () => {
    const r = PreprovisionUserRequestSchema.parse({
      email: "a@b.com",
      role: "reviewer",
    });
    expect(r.email).toBe("a@b.com");
  });
});

describe("ArticleSchema", () => {
  const valid = {
    id: 1,
    title: "My Article",
    materialType: "school",
    grade: "三年級",
    unit: "Unit 1",
    week: 2,
    page: 10,
    categoryId: null,
    level: "A1",
    status: "pending",
    createdBy: 5,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  };

  it("解析合法文章", () => {
    const parsed = ArticleSchema.parse(valid);
    expect(parsed.title).toBe("My Article");
    expect(parsed.materialType).toBe("school");
  });

  it("允許課外教材的可空欄位為 null", () => {
    const parsed = ArticleSchema.parse({
      ...valid,
      materialType: "extracurricular",
      grade: null,
      unit: null,
      week: null,
      page: null,
      categoryId: 3,
    });
    expect(parsed.categoryId).toBe(3);
    expect(parsed.grade).toBeNull();
  });

  it("拒絕缺少 title 的文章", () => {
    const { title, ...rest } = valid;
    expect(ArticleSchema.safeParse(rest).success).toBe(false);
  });

  it("拒絕非法 status", () => {
    expect(ArticleSchema.safeParse({ ...valid, status: "weird" }).success).toBe(
      false,
    );
  });
});

describe("ParagraphSchema", () => {
  const valid = {
    id: 1,
    articleId: 10,
    idx: 0,
    text: "Hello world.",
    translation: "你好，世界。",
    enAudioPath: "articles/10/p0.en.wav",
    zhAudioPath: "articles/10/p0.zh.wav",
    status: "done",
  };

  it("解析合法段落", () => {
    expect(ParagraphSchema.parse(valid).idx).toBe(0);
  });

  it("允許尚未處理的段落（translation/audio 為 null）", () => {
    const parsed = ParagraphSchema.parse({
      ...valid,
      translation: null,
      enAudioPath: null,
      zhAudioPath: null,
      status: "pending",
    });
    expect(parsed.translation).toBeNull();
  });

  it("拒絕缺少 text 的段落", () => {
    const { text, ...rest } = valid;
    expect(ParagraphSchema.safeParse(rest).success).toBe(false);
  });
});

describe("WordSchema", () => {
  it("解析合法單字", () => {
    const parsed = WordSchema.parse({
      id: 1,
      normalizedWord: "habit",
      enAudioPath: "words/1/en.wav",
      createdAt: "2026-06-29T00:00:00.000Z",
    });
    expect(parsed.normalizedWord).toBe("habit");
  });

  it("允許尚未產生發音（en_audio_path 為 null）", () => {
    const parsed = WordSchema.parse({
      id: 1,
      normalizedWord: "habit",
      enAudioPath: null,
      createdAt: "2026-06-29T00:00:00.000Z",
    });
    expect(parsed.enAudioPath).toBeNull();
  });
});

describe("WordExplanationSchema", () => {
  const valid = {
    id: 1,
    wordId: 2,
    articleId: 3,
    paragraphId: 4,
    enExplanation: "a regular practice",
    enExplanationAudioPath: null,
    enExample: "Reading is a good habit.",
    enExampleAudioPath: null,
    zhTranslation: "習慣",
    zhTranslationAudioPath: null,
    zhExplanation: "經常重複的行為",
    zhExplanationAudioPath: null,
    zhExample: "閱讀是個好習慣。",
    zhExampleAudioPath: null,
    headword: "habit",
    createdAt: "2026-06-29T00:00:00.000Z",
  };

  it("解析含全部 10 個內容欄位的解釋", () => {
    const parsed = WordExplanationSchema.parse(valid);
    expect(parsed.enExplanation).toBe("a regular practice");
    expect(parsed.zhExample).toBe("閱讀是個好習慣。");
  });

  it("允許 paragraphId 為 null", () => {
    expect(
      WordExplanationSchema.parse({ ...valid, paragraphId: null }).paragraphId,
    ).toBeNull();
  });

  it("拒絕缺少 wordId 的解釋", () => {
    const { wordId, ...rest } = valid;
    expect(WordExplanationSchema.safeParse(rest).success).toBe(false);
  });
});

describe("WordLookupRequestSchema", () => {
  it("解析合法查詢請求", () => {
    const parsed = WordLookupRequestSchema.parse({
      articleId: 1,
      paragraphId: 2,
      word: "habit",
    });
    expect(parsed.word).toBe("habit");
  });

  it("拒絕空字串單字", () => {
    expect(
      WordLookupRequestSchema.safeParse({
        articleId: 1,
        paragraphId: 2,
        word: "",
      }).success,
    ).toBe(false);
  });

  it("拒絕缺少 articleId", () => {
    expect(
      WordLookupRequestSchema.safeParse({ paragraphId: 2, word: "habit" })
        .success,
    ).toBe(false);
  });
});

describe("WordLookupResponseSchema", () => {
  it("解析含單字與多份解釋（附來源文章）的回應", () => {
    const parsed = WordLookupResponseSchema.parse({
      word: {
        id: 1,
        normalizedWord: "habit",
        enAudioPath: "words/1/en.wav",
        createdAt: "2026-06-29T00:00:00.000Z",
      },
      explanations: [
        {
          id: 1,
          wordId: 1,
          articleId: 3,
          paragraphId: 4,
          enExplanation: "a regular practice",
          enExplanationAudioPath: null,
          enExample: "Reading is a good habit.",
          enExampleAudioPath: null,
          zhTranslation: "習慣",
          zhTranslationAudioPath: null,
          zhExplanation: "經常重複的行為",
          zhExplanationAudioPath: null,
          zhExample: "閱讀是個好習慣。",
          zhExampleAudioPath: null,
          headword: "habit",
          createdAt: "2026-06-29T00:00:00.000Z",
          article: { id: 3, title: "Source Article" },
        },
      ],
    });
    expect(parsed.explanations).toHaveLength(1);
    expect(parsed.explanations[0].article.title).toBe("Source Article");
  });

  it("接受空解釋清單", () => {
    const parsed = WordLookupResponseSchema.parse({
      word: {
        id: 1,
        normalizedWord: "habit",
        enAudioPath: null,
        createdAt: "2026-06-29T00:00:00.000Z",
      },
      explanations: [],
    });
    expect(parsed.explanations).toEqual([]);
  });
});
