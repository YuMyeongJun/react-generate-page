import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

function toCamelCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

interface GeneratePageOptions {
  pagePath: string; // 예: test/path
  pageName: string; // 예: TestPage
}

function generateComponent(options: GeneratePageOptions): string {
  return `export const ${options.pageName}Component = () => {
  return (
    <div></div>
  );
};
`;
}

function generateViewModel(options: GeneratePageOptions): string {
  return `import { createContext } from 'react';

interface I${options.pageName}ViewModel {
  // TODO: ViewModel 인터페이스 정의
}

export const ${options.pageName}ViewModel = createContext<I${options.pageName}ViewModel | undefined>(
  undefined,
);

interface Props {
  children: React.ReactNode;
}

export const ${options.pageName}ViewModelProvider = ({ children }: Props) => {
  return (
    <${options.pageName}ViewModel.Provider
      value={{
        // TODO: ViewModel 값 정의
      }}
    >
      {children}
    </${options.pageName}ViewModel.Provider>
  );
};
`;
}

function generatePage(options: GeneratePageOptions): string {
  return `import {
  ${options.pageName}Component,
  ${options.pageName}ViewModelProvider,
} from '@components/pages/${options.pagePath}';

export const ${options.pageName}Page = () => {
  return (
    <${options.pageName}ViewModelProvider>
      <${options.pageName}Component />
    </${options.pageName}ViewModelProvider>
  );
};
`;
}

function generateComponentIndex(options: GeneratePageOptions): string {
  return `export * from './${options.pageName}Component';
export * from './${options.pageName}ViewModel';
`;
}

function generatePageIndex(options: GeneratePageOptions): string {
  return `export * from './${options.pageName}Page';
`;
}

function generateModelIndex(options: GeneratePageOptions): string {
  return `// Add model exports here
`;
}

function generateParentIndex(childPath: string): string {
  const childName = path.basename(childPath);
  return `export * from './${childName}';\n`;
}

function ensureParentIndexFiles(basePath: string, relativePath: string) {
  const parts = relativePath.split("/");
  let currentPath = basePath;

  // 마지막 디렉토리는 제외 (이미 처리되었으므로)
  for (let i = 0; i < parts.length - 1; i++) {
    currentPath = path.join(currentPath, parts[i]);

    // 디렉토리가 없으면 생성
    ensureDirectoryExists(currentPath);

    const indexPath = path.join(currentPath, "index.ts");
    const childDir = parts[i + 1];

    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, generateParentIndex(childDir));
    } else {
      // 이미 존재하는 index.ts 파일에 새로운 export 추가
      const content = fs.readFileSync(indexPath, "utf-8");
      if (!content.includes(childDir)) {
        fs.appendFileSync(indexPath, generateParentIndex(childDir));
      }
    }
  }
}

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function generatePageFiles(options: GeneratePageOptions) {
  console.log("\n📁 페이지 생성 옵션을 선택해주세요:");

  const pagePath = await askQuestion(
    `페이지 경로를 입력해주세요 (예: test/path): `
  );

  const pageName = await askQuestion(
    `페이지 이름을 입력해주세요 (예: TestPage): `
  );

  const createInterface = await askQuestion(
    `모델 인터페이스 디렉토리를 생성하시겠습니까? (models/interfaces/${pagePath}/${pageName}) (y/N): `
  );

  const createType = await askQuestion(
    `모델 타입 디렉토리를 생성하시겠습니까? (models/types/${pagePath}/${pageName}) (y/N): `
  );

  const createHooks = await askQuestion(
    `훅스 디렉토리를 생성하시겠습니까? (hooks/client/${pagePath}/${pageName}) (y/N): `
  );

  const fullPath = pagePath ? `${pagePath}/${pageName}` : pageName;
  const componentDir = path.join("src/components/pages", fullPath);
  const pagesDir = path.join("src/pages", fullPath);
  const interfaceDir = path.join("src/models/interfaces", fullPath);
  const typeDir = path.join("src/models/types", fullPath);
  const hooksDir = path.join("src/hooks/client", fullPath);

  // 기본 디렉토리 생성
  ensureDirectoryExists(componentDir);
  ensureDirectoryExists(pagesDir);

  // 선택적 디렉토리 생성
  if (createInterface.toLowerCase() === "y") {
    ensureDirectoryExists(interfaceDir);
    fs.writeFileSync(path.join(interfaceDir, "index.ts"), "");
  }

  if (createType.toLowerCase() === "y") {
    ensureDirectoryExists(typeDir);
    fs.writeFileSync(path.join(typeDir, "index.ts"), "");
  }

  if (createHooks.toLowerCase() === "y") {
    ensureDirectoryExists(hooksDir);
    fs.writeFileSync(path.join(hooksDir, "index.ts"), "");
  }

  // components 디렉토리 파일 생성
  fs.writeFileSync(
    path.join(componentDir, `${options.pageName}Component.tsx`),
    generateComponent(options)
  );
  fs.writeFileSync(
    path.join(componentDir, `${options.pageName}ViewModel.tsx`),
    generateViewModel(options)
  );
  fs.writeFileSync(
    path.join(componentDir, "index.ts"),
    generateComponentIndex(options)
  );

  // pages 디렉토리 파일 생성
  fs.writeFileSync(
    path.join(pagesDir, `${options.pageName}Page.tsx`),
    generatePage(options)
  );
  fs.writeFileSync(path.join(pagesDir, "index.ts"), generatePageIndex(options));

  // 상위 디렉토리의 index.ts 파일들 생성
  ensureParentIndexFiles("src/components/pages", options.pagePath);
  ensureParentIndexFiles("src/pages", options.pagePath);

  if (createInterface.toLowerCase() === "y") {
    ensureParentIndexFiles("src/models/interfaces", options.pagePath);
  }
  if (createType.toLowerCase() === "y") {
    ensureParentIndexFiles("src/models/types", options.pagePath);
  }
  if (createHooks.toLowerCase() === "y") {
    ensureParentIndexFiles("src/hooks/client", options.pagePath);
  }

  console.log(`✨ 페이지가 성공적으로 생성되었습니다!

생성된 파일:
- ${path.join(componentDir, `${options.pageName}Component.tsx`)}
- ${path.join(componentDir, `${options.pageName}ViewModel.tsx`)}
- ${path.join(componentDir, "index.ts")}
- ${path.join(pagesDir, `${options.pageName}Page.tsx`)}
- ${path.join(pagesDir, "index.ts")}${
    createInterface.toLowerCase() === "y"
      ? `\n- ${path.join(interfaceDir, "index.ts")}`
      : ""
  }${
    createType.toLowerCase() === "y"
      ? `\n- ${path.join(typeDir, "index.ts")}`
      : ""
  }${
    createHooks.toLowerCase() === "y"
      ? `\n- ${path.join(hooksDir, "index.ts")}`
      : ""
  }

상위 디렉토리의 index.ts 파일들도 업데이트되었습니다.
`);
}

// 메인 실행 부분
if (process.argv.length < 2) {
  generatePageFiles({
    pagePath: "",
    pageName: "",
  }).catch(console.error);
} else {
  const pagePath = process.argv[2] || "";
  const pageName = process.argv[3] || "";

  generatePageFiles({
    pagePath: pagePath ? toCamelCase(pagePath) : "",
    pageName: pageName ? toPascalCase(pageName) : "",
  }).catch(console.error);
}
