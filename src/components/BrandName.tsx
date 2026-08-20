export default function BrandName({
  className = '',
  tone = 'navy',
}: {
  className?: string;
  tone?: 'navy' | 'white';
}) {
  return (
    <span
      className={`font-extrabold tracking-tight ${
        tone === 'white' ? 'text-white' : 'text-[#31356E]'
      } ${className}`}
      style={{ fontFamily: '"Montserrat", "Arial Black", sans-serif' }}
    >
      ЮниРЭК
    </span>
  );
}
