/** Known stacks we label explicitly; other languages pass through as lowercase. */
export type KnownProjectStack =
  | "nextjs_ts"
  | "node"
  | "go"
  | "rust"
  | "python"
  | "ruby"
  | "java"
  | "php"
  | "csharp"
  | "unknown";

export type DetectedStack = KnownProjectStack | (string & {});

export type StackFileSignals = {
  /** Raw package.json text when present at repo root. */
  packageJson?: string | null;
  hasGoMod?: boolean;
  hasCargoToml?: boolean;
  hasPyproject?: boolean;
  hasRequirementsTxt?: boolean;
  hasSetupPy?: boolean;
  hasGemfile?: boolean;
  hasPomXml?: boolean;
  hasBuildGradle?: boolean;
  hasComposerJson?: boolean;
  hasCsprojOrSln?: boolean;
};

/** Language bytes map from GitHub/GitLab Languages API (name → bytes). */
export type LanguageBytes = Record<string, number>;

export type StackDetectionResult = {
  stack: DetectedStack;
  source: "files" | "languages" | "unknown";
  detail: string;
};

function packageJsonHasNext(raw: string): boolean {
  try {
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      pkg.dependencies?.next ||
        pkg.devDependencies?.next ||
        pkg.dependencies?.["next"] ||
        pkg.devDependencies?.["next"],
    );
  } catch {
    return false;
  }
}

function mapLanguageToStack(language: string): DetectedStack {
  const key = language.trim().toLowerCase();
  switch (key) {
    case "typescript":
    case "javascript":
    case "vue":
    case "svelte":
      return "node";
    case "python":
      return "python";
    case "go":
      return "go";
    case "rust":
      return "rust";
    case "ruby":
      return "ruby";
    case "java":
    case "kotlin":
      return "java";
    case "php":
      return "php";
    case "c#":
    case "csharp":
      return "csharp";
    default:
      return key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
  }
}

export function dominantLanguage(
  languages: LanguageBytes | null | undefined,
): string | null {
  if (!languages) return null;
  let best: string | null = null;
  let bestBytes = 0;
  for (const [name, bytes] of Object.entries(languages)) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) continue;
    if (bytes > bestBytes) {
      bestBytes = bytes;
      best = name;
    }
  }
  return best;
}

/**
 * Pure stack inference from file signals + optional languages map.
 * File markers win over Languages API.
 */
export function inferStackFromSignals(
  files: StackFileSignals,
  languages?: LanguageBytes | null,
): StackDetectionResult {
  if (files.packageJson != null && files.packageJson !== "") {
    if (packageJsonHasNext(files.packageJson)) {
      return {
        stack: "nextjs_ts",
        source: "files",
        detail: "package.json includes next",
      };
    }
    return {
      stack: "node",
      source: "files",
      detail: "package.json present",
    };
  }
  if (files.hasGoMod) {
    return { stack: "go", source: "files", detail: "go.mod" };
  }
  if (files.hasCargoToml) {
    return { stack: "rust", source: "files", detail: "Cargo.toml" };
  }
  if (files.hasPyproject || files.hasRequirementsTxt || files.hasSetupPy) {
    return {
      stack: "python",
      source: "files",
      detail: files.hasPyproject
        ? "pyproject.toml"
        : files.hasRequirementsTxt
          ? "requirements.txt"
          : "setup.py",
    };
  }
  if (files.hasGemfile) {
    return { stack: "ruby", source: "files", detail: "Gemfile" };
  }
  if (files.hasPomXml || files.hasBuildGradle) {
    return {
      stack: "java",
      source: "files",
      detail: files.hasPomXml ? "pom.xml" : "build.gradle",
    };
  }
  if (files.hasComposerJson) {
    return { stack: "php", source: "files", detail: "composer.json" };
  }
  if (files.hasCsprojOrSln) {
    return { stack: "csharp", source: "files", detail: "*.csproj / *.sln" };
  }

  const lang = dominantLanguage(languages);
  if (lang) {
    const stack = mapLanguageToStack(lang);
    return {
      stack,
      source: "languages",
      detail: `dominant language ${lang}`,
    };
  }

  return {
    stack: "unknown",
    source: "unknown",
    detail: "no file or language signals",
  };
}
