'use client';

export default function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab" onClick={onClick} aria-label="nova tarefa">
      +
    </button>
  );
}
