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
  pagePath: string; // 예: testPath/testPage
  pageName: string; // 예: PaperSetting
}

function generateComponent(options: GeneratePageOptions): string {
  return `export const ${options.pageName}Component = () => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">페이지 제목</h1>
        <p className="text-gray-600">페이지 설명</p>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-2 text-center border-b">No</th>
                {/* 필요한 컬럼 추가 */}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 text-center border-b">1</td>
                {/* 필요한 데이터 추가 */}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
  console.log("\n📁 모델 생성 옵션을 선택해주세요:");

  const createInterface = await askQuestion(
    `모델 인터페이스 디렉토리를 생성하시겠습니까? (models/interfaces/${options.pagePath}) (y/N): `
  );

  const createType = await askQuestion(
    `모델 타입 디렉토리를 생성하시겠습니까? (models/types/${options.pagePath}) (y/N): `
  );

  const createHooks = await askQuestion(
    `훅스 디렉토리를 생성하시겠습니까? (hooks/client/${options.pagePath}) (y/N): `
  );

  const componentDir = path.join("src/components/pages", options.pagePath);
  const pagesDir = path.join("src/pages", options.pagePath);
  const interfaceDir = path.join("src/models/interfaces", options.pagePath);
  const typeDir = path.join("src/models/types", options.pagePath);
  const hooksDir = path.join("src/hooks/client", options.pagePath);

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

// 사용 예시
const rawPath = process.argv[2]; // 예: testPath/testPage
const pathParts = rawPath.split("/");
const pageName = toPascalCase(pathParts.pop() || "");
const parentPath = pathParts.map(toCamelCase).join("/");
const options: GeneratePageOptions = {
  pagePath: parentPath
    ? `${parentPath}/${toCamelCase(pageName)}`
    : toCamelCase(pageName),
  pageName,
};

generatePageFiles(options).catch(console.error);
