export const TestPageCondition = () => {
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      // TODO: 검색 로직 구현
    }}>
       <button
          type="submit"
          className="ml-auto rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          검색
        </button>
    </form>
  );
};
