const SearchBar = ({ onSearch, loading, value, onValueChange }) => {

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="Search by brand name, ad text..."
        className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
};

export default SearchBar;
